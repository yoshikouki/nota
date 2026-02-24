/**
 * @notionhq/client v5 の API マッピング
 *
 * SDK v5 では「データベース」の概念が変わった:
 *  - DatabaseObjectResponse  … 外側のコンテナ（properties なし）
 *  - DataSourceObjectResponse … クエリ可能な実体（properties あり）
 *
 * nota では DataSourceObjectResponse を "database" として扱う。
 * ID は DataSourceObjectResponse.id (= data_source_id) を使う。
 */

import { getClient, withRetry } from "./client";
import { toNotaPage } from "./pages";
import type { NotaPage } from "../types";
import type {
  DataSourceObjectResponse,
  PageObjectResponse,
  QueryDataSourceParameters,
} from "@notionhq/client/build/src/api-endpoints";

// ── NotaDatabase ──────────────────────────────────────────────────────────────

export interface NotaDatabase {
  id: string;
  title: string;
  url: string;
  createdAt: Date;
  lastEditedAt: Date;
  propertyCount: number;
}

export function toNotaDatabase(db: DataSourceObjectResponse): NotaDatabase {
  const title = db.title.map((t) => t.plain_text).join("") || "(Untitled)";
  return {
    id: db.id,
    title,
    url: db.url,
    createdAt: new Date(db.created_time),
    lastEditedAt: new Date(db.last_edited_time),
    propertyCount: Object.keys(db.properties).length,
  };
}

// ── list ──────────────────────────────────────────────────────────────────────

/** List all data sources (databases) the integration can access. */
export async function searchDatabases(): Promise<DataSourceObjectResponse[]> {
  const client = getClient();
  const dbs: DataSourceObjectResponse[] = [];
  let nextCursor: string | undefined;

  do {
    const res = await withRetry(() =>
      client.search({
        filter: { value: "data_source", property: "object" },
        start_cursor: nextCursor,
      })
    );
    for (const result of res.results) {
      if (result.object === "data_source" && "properties" in result) {
        dbs.push(result as DataSourceObjectResponse);
      }
    }
    nextCursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (nextCursor);

  return dbs;
}

// ── schema ────────────────────────────────────────────────────────────────────

/** Retrieve a data source's full schema (properties definition). */
export async function getDatabaseSchema(
  dataSourceId: string
): Promise<DataSourceObjectResponse> {
  const client = getClient();
  const res = await withRetry(() =>
    client.dataSources.retrieve({ data_source_id: dataSourceId })
  );
  if (!("properties" in res)) {
    throw new Error(`Received partial response for data source: ${dataSourceId}`);
  }
  return res as DataSourceObjectResponse;
}

// ── query ─────────────────────────────────────────────────────────────────────

export type QueryFilter = QueryDataSourceParameters["filter"];

export interface QueryOptions {
  filter?: QueryFilter;
  sorts?: Array<
    | { property: string; direction: "ascending" | "descending" }
    | { timestamp: "created_time" | "last_edited_time"; direction: "ascending" | "descending" }
  >;
  limit?: number;
}

/** Query a data source with optional filter, sort, and limit. */
export async function queryDatabase(
  dataSourceId: string,
  options: QueryOptions = {}
): Promise<PageObjectResponse[]> {
  const client = getClient();
  const pages: PageObjectResponse[] = [];
  let nextCursor: string | undefined;

  do {
    const batchSize = options.limit
      ? Math.min(options.limit - pages.length, 100)
      : 100;

    const res = await withRetry(() =>
      client.dataSources.query({
        data_source_id: dataSourceId,
        ...(options.filter ? { filter: options.filter } : {}),
        ...(options.sorts ? { sorts: options.sorts as QueryDataSourceParameters["sorts"] } : {}),
        page_size: batchSize,
        ...(nextCursor ? { start_cursor: nextCursor } : {}),
        result_type: "page",
      })
    );

    for (const result of res.results) {
      if ("properties" in result && result.object === "page") {
        pages.push(result as PageObjectResponse);
      }
    }

    nextCursor =
      res.has_more && (!options.limit || pages.length < options.limit)
        ? (res.next_cursor ?? undefined)
        : undefined;
  } while (nextCursor);

  return pages;
}

/** Query and convert results to NotaPage. */
export async function queryDatabasePages(
  dataSourceId: string,
  options: QueryOptions = {}
): Promise<NotaPage[]> {
  const raw = await queryDatabase(dataSourceId, options);
  return raw.map(toNotaPage);
}
