import { Command } from "commander";
import { fetchPage, searchPagesRaw, toNotaPage } from "../api/pages";
import type { NotaPage } from "../types";
import { renderTree, type TreeNode } from "../render/tree";
import {
  getCachedSearch,
  setCachedPage,
  setCachedSearch,
} from "../cache/store";
import { loadConfig } from "../utils/config-file";

const DEFAULT_DEPTH = 3;

interface TreeOptions {
  cache?: boolean;
  root?: string;
  depth: number;
}

function parseDepth(value: string): number {
  const depth = Number.parseInt(value, 10);
  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error("depth must be a positive integer");
  }
  return depth;
}

function byTitleAndId(a: { id: string; title: string }, b: { id: string; title: string }): number {
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

function buildChildrenMap(pages: NotaPage[]): Map<string, NotaPage[]> {
  const childrenMap = new Map<string, NotaPage[]>();
  for (const page of pages) {
    if (page.parentType !== "page" || !page.parentId) {
      continue;
    }
    const siblings = childrenMap.get(page.parentId) ?? [];
    siblings.push(page);
    childrenMap.set(page.parentId, siblings);
  }
  for (const [parentId, children] of childrenMap) {
    childrenMap.set(parentId, [...children].sort(byTitleAndId));
  }
  return childrenMap;
}

function buildForestFromPages(
  pages: NotaPage[],
  maxDepth: number
): TreeNode[] {
  const pageMap = new Map(pages.map((page) => [page.id, page]));
  const childrenMap = buildChildrenMap(pages);

  const roots = pages
    .filter(
      (page) =>
        !(page.parentType === "page" && page.parentId && pageMap.has(page.parentId))
    )
    .sort(byTitleAndId);

  const buildNode = (
    page: NotaPage,
    depth: number,
    visited: Set<string>
  ): TreeNode => {
    if (depth <= 1 || visited.has(page.id)) {
      return { id: page.id, title: page.title, children: [] };
    }

    visited.add(page.id);
    const children =
      childrenMap
        .get(page.id)
        ?.map((child) => buildNode(child, depth - 1, visited)) ?? [];
    visited.delete(page.id);

    return { id: page.id, title: page.title, children };
  };

  return roots.map((root) => buildNode(root, maxDepth, new Set<string>()));
}

async function buildRootTree(
  rootId: string,
  maxDepth: number,
  pages: NotaPage[]
): Promise<TreeNode> {
  const childrenIdsMap = new Map<string, string[]>();
  const knownPages = new Map<string, NotaPage>();

  for (const page of pages) {
    knownPages.set(page.id, page);
    if (page.parentType !== "page" || !page.parentId) {
      continue;
    }
    const siblings = childrenIdsMap.get(page.parentId) ?? [];
    siblings.push(page.id);
    childrenIdsMap.set(page.parentId, siblings);
  }

  const pageCache = new Map<string, NotaPage>();

  const getPage = async (pageId: string): Promise<NotaPage> => {
    const cached = pageCache.get(pageId);
    if (cached) {
      return cached;
    }
    const fetched = await fetchPage(pageId);
    pageCache.set(pageId, fetched);
    knownPages.set(pageId, fetched);
    return fetched;
  };

  const sortChildIds = (ids: string[]): string[] => {
    return [...ids].sort((a, b) => {
      const pageA = knownPages.get(a);
      const pageB = knownPages.get(b);
      if (pageA && pageB) {
        return byTitleAndId(pageA, pageB);
      }
      if (pageA && !pageB) {
        return -1;
      }
      if (!pageA && pageB) {
        return 1;
      }
      return a.localeCompare(b);
    });
  };

  const buildNode = async (
    pageId: string,
    depth: number,
    visited: Set<string>
  ): Promise<TreeNode> => {
    const page = await getPage(pageId);
    if (depth <= 1 || visited.has(pageId)) {
      return { id: page.id, title: page.title, children: [] };
    }

    visited.add(pageId);
    const childIds = sortChildIds(childrenIdsMap.get(pageId) ?? []);
    const children: TreeNode[] = [];
    for (const childId of childIds) {
      children.push(await buildNode(childId, depth - 1, visited));
    }
    visited.delete(pageId);

    return { id: page.id, title: page.title, children };
  };

  return buildNode(rootId, maxDepth, new Set<string>());
}

export function registerTreeCommand(program: Command): void {
  program
    .command("tree")
    .description("Render page hierarchy as a tree")
    .option("--cache", "Use cache when available")
    .option("--root <page-id>", "Root page ID")
    .option("--depth <n>", "Tree depth (default: 3)", parseDepth, DEFAULT_DEPTH)
    .action(async (options: TreeOptions, command: Command) => {
      try {
        const config = loadConfig();
        const cacheSource = command.getOptionValueSource("cache");
        const allowStale =
          options.cache === true ||
          (cacheSource !== "cli" && config.cache?.enabled === true);

        let rawPages = getCachedSearch(undefined, "none", allowStale);

        if (!rawPages) {
          rawPages = await searchPagesRaw();
          setCachedSearch(undefined, "none", rawPages);
          for (const page of rawPages) {
            setCachedPage(page);
          }
        }

        const pages = rawPages.map(toNotaPage);
        const depth = options.depth ?? DEFAULT_DEPTH;

        if (options.root) {
          const rootTree = await buildRootTree(options.root, depth, pages);
          console.log(renderTree([rootTree]));
          return;
        }

        const trees = buildForestFromPages(pages, depth);
        if (trees.length > 0) {
          console.log(renderTree(trees));
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error: ${message}`);
        process.exit(1);
      }
    });
}
