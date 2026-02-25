# nota — 詳細設計

作成: 2026-02-23

---

## CLI フレーム選定

**推奨: `commander`**

| 観点 | oclif | commander |
|------|-------|-----------|
| Bun 相性 | △ Node.js 前提のプラグイン機構多く、Bun 動作保証が薄い | ✅ 依存が軽量、Bun でそのまま動く |
| brew 配布 | △ `@oclif/dev-cli` 前提でバイナリ生成が複雑 | ✅ `bun build --compile` → 単一バイナリ → brew 配布が直線的 |
| サブコマンド | ✅ ファイルベース自動登録 | ✅ 手動登録（数が多くないので問題なし） |
| 学習コスト | 高い（独自規約多）| 低い |

nota のコマンド数は 10 未満。oclif のスケールメリットは不要。`commander` + `bun build --compile` が最短距離。

---

## ディレクトリ構造

```
nota/
├── src/
│   ├── index.ts          # エントリポイント（commander root）
│   ├── commands/
│   │   ├── list.ts       # nota list
│   │   ├── show.ts       # nota show <id>
│   │   ├── tree.ts       # nota tree
│   │   ├── edit.ts       # nota edit <id>
│   │   └── delete.ts     # nota delete <id>
│   ├── api/
│   │   ├── client.ts     # NotionClient ラッパー（認証・Rate Limit）
│   │   ├── pages.ts      # ページ一覧・取得・編集・削除
│   │   └── blocks.ts     # ブロック取得・更新
│   ├── cache/
│   │   ├── store.ts      # JSON キャッシュの read/write/invalidate
│   │   └── schema.ts     # キャッシュ JSON の型定義
│   ├── render/
│   │   ├── markdown.ts   # notion-to-md ラッパー
│   │   └── tree.ts       # tree 表示のレンダラ
│   ├── types/
│   │   └── index.ts      # 共通型（NotaPage, NotaBlock 等）
│   └── utils/
│       ├── config.ts     # 環境変数読み込み・バリデーション
│       └── xdg.ts        # XDG パス解決
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

---

## コマンド設計

```
nota list [--database <id>] [--search <query>] [--cache] [--json]
nota show <page-id> [--cache] [--raw]
nota tree [--root <page-id>] [--depth <n>] [--cache]
nota edit <page-id> [--title <title>] [--editor]
nota delete <page-id> [--force]
nota cache clear [--all | --page <id>]
nota cache status
```

### UX 方針

- `--cache` フラグ付きのとき → キャッシュから返す（stale でも返す）
- キャッシュがなければ自動フォールバックして API 取得
- `--json` フラグ → 生 JSON 出力（パイプ用途）
- `nota edit --editor` → `$EDITOR` を開いて Markdown 編集 → 保存時に API 更新

---

## キャッシュ設計

### 方針：SDK レスポンスをキャッシュする（アプリケーション境界でのスナップショット）

キャッシュは **Notion SDK の生レスポンス（変換前）** を保存する。`NotaPage` や Markdown に変換した後の値ではない。

**理由：**
- `NotaPage` の型定義が変わっても、キャッシュは無効にならない（raw から再変換できる）
- Markdown レンダリングロジックが変わっても raw ブロックから再生成できる
- 将来フィールドを追加しても、キャッシュ済みの raw データからすでに取れる
- キャッシュが「API のスナップショット」として一貫した意味を持つ

変換（`PageObjectResponse → NotaPage`）は **常に読み出し時に行う**。

### 保存場所：リクエスト単位のディレクトリ構造

```
$XDG_CACHE_HOME/nota/          （デフォルト: ~/.cache/nota/）
  pages/
    <page_id>.json             # pages.retrieve() の結果
  blocks/
    <page_id>.json             # blocks.children.list() の結果（再帰展開済み）
  searches/
    <hash>.json                # search(query, sort) の結果
```

**グローバル1ファイルではなくリクエスト単位でファイルを分割する理由：**
- 並列書き込みの race condition がなくなる（異なるページは異なるファイル）
- 無効化がシンプル — `rm pages/<id>.json` で1ページ消える
- ファイルが小さく atomic rename が確実
- `last_edited_time` 差分チェックと組み合わせた細粒度な無効化が容易

### JSON スキーマ（ファイル単位）

```jsonc
// pages/<page_id>.json
{
  "raw": { /* PageObjectResponse をそのまま */ },
  "cached_at": "ISO8601",
  "ttl_seconds": 300
}

// blocks/<page_id>.json
{
  "raw": [ /* BlockObjectResponse[] 再帰展開済み */ ],
  "cached_at": "ISO8601",
  "ttl_seconds": 300
}

// searches/<hash>.json
{
  "raw": [ /* PageObjectResponse[] */ ],
  "query": "string | undefined",
  "sort": "edited | none",
  "cached_at": "ISO8601",
  "ttl_seconds": 60
}
```

hash = `base64url(JSON.stringify({query, sort})).slice(0, 32)`

### stale-while-revalidate + last_edited_time 差分チェック

**通常実行（`--cache` なし）：**
1. fresh キャッシュがあればそのまま返す（API 呼ばない）
2. stale または miss → API 取得 → キャッシュ更新

**`cache.enabled: true` / `--cache` 時（オフライン優先）：**
1. stale でもキャッシュを即返す（fast path）
2. stale だった場合、**バックグラウンドで非同期リフレッシュ**を起動（fire-and-forget）
3. バックグラウンド処理：
   - `search()` を実行して最新の `last_edited_time` を取得
   - 各ページのキャッシュ済み `last_edited_time` と比較
   - **変更があったページだけ** `pages/<id>.json` / `blocks/<id>.json` を削除（= 次回 fetch 時に再取得）
   - `searches/<hash>.json` を更新
4. 次回の `nota show <id>` で自動的に最新を取得

**「削除することで無効化する」**が設計の核心。ファイルがなければ miss → API fetch → 保存。

### TTL

| エントリ | デフォルト TTL |
|---------|--------------|
| pages   | 300秒（5分）  |
| blocks  | 300秒（5分）  |
| searches| 60秒（1分）   |

## Config File

永続デフォルトは JSON 設定ファイルから読み込む。

### 保存場所（XDG 準拠）

```
$XDG_CONFIG_HOME/nota/   （デフォルト: ~/.config/nota/）
  config.json
```

### スキーマ

```jsonc
{
  "cache": {
    "enabled": false, // 既定: false
    "ttl": 300        // 既定: 300
  },
  "list": {
    "sort": "edited", // 既定: edited
    "database": "..." // 任意: list の既定 DB ID
  }
}
```

### 優先順位

設定値は次の順でマージする。

1. CLI フラグ
2. `config.json`
3. ハードコード既定値

### エラー時の挙動

- 設定ファイルが存在しない場合は `{}` を返す
- JSON パースエラー時は stderr に警告し、`{}` を返す
- 読み込み失敗時は `{}` を返す（CLI の実行は継続）

---

## Notion API マッピング

| コマンド | API | 注意 |
|---------|-----|------|
| `nota list` | `databases.query` or `search` | DB 指定なし → `search`。指定あり → `databases.query` |
| `nota show` | `pages.retrieve` + `blocks.children.list`（再帰） | ネスト対応のため再帰必須 |
| `nota tree` | `pages.retrieve` を親を辿りながら再帰 | API コール数注意。キャッシュ必須 |
| `nota edit --title` | `pages.update` | title は `properties.title` |
| `nota edit --editor` | `blocks.children.append` / `updateBlock` | MD→Notion 変換に `@tryfabric/martian` 利用 |
| `nota delete` | `pages.update({ archived: true })` | Notion に DELETE はない。archive = soft delete |

### Rate Limit 対応

- Notion API は 3 req/s（平均）
- 429 受信時 → `Retry-After` ヘッダを見て待機
- `client.ts` に exponential backoff を実装（最大 3 回）

---

## エラーハンドリング方針

| エラー | 表示 | 終了コード |
|--------|------|-----------|
| 認証エラー (401) | "NOTION_TOKEN が未設定か無効です" | 1 |
| 権限エラー (403) | "このページへのアクセス権がありません" | 1 |
| 404 | "ページが見つかりません: \<id\>" | 1 |
| Rate Limit (429) | 自動リトライ（最大 3 回、backoff） | - |
| ネットワークエラー | stale キャッシュがあれば返してワーニング表示 | 0 |
| キャッシュ破損 | 破損ファイルを削除して再取得 | - |

- エラーは **stderr** に出す（パイプ利用を壊さない）

---

## 型定義方針

SDK の型はそのまま使わずラップする（union が深くて扱いにくいため）。

```typescript
// types/index.ts
export interface NotaPage {
  id: string;
  title: string;
  url: string;
  parentId: string | null;
  parentType: 'page' | 'database' | 'workspace';
  createdAt: Date;
  lastEditedAt: Date;
}

export interface NotaBlock {
  id: string;
  type: string;       // paragraph, heading_1, etc.
  content: string;    // プレーンテキスト
  children: NotaBlock[];
}
```

SDK の `PageObjectResponse` → `NotaPage` への変換は `api/pages.ts` に集約。

---

## 実装上の注意点・落とし穴

1. **`notion-to-md` は blocks.children を自前取得しない**  
   `blocks.children.list` で全ブロックを取ってから `n2m.blocksToMarkdown()` に渡す。ページ ID を直接渡すメソッドは内部で API を呼ぶので Rate Limit を食う。

2. **Markdown → Notion ブロックの逆変換**  
   `notion-to-md` は一方向（Notion → MD）のみ。`nota edit --editor` では `@tryfabric/martian` を採用。

3. **tree の深さ制限**  
   `pages.retrieve` は parent の parent を返さない。tree 構築は再帰 API 呼び出しになるのでデフォルト `--depth 3` に制限。

4. **Bun の `--compile` と動的 require**  
   `notion-to-md` が内部で動的 import をしていないか確認必要。Bun compile は dynamic require が苦手。

5. **XDG_CACHE_HOME が未設定の場合**  
   `$HOME/.cache` にフォールバック（Linux/macOS 両対応）。

6. **JSON キャッシュの競合**  
   複数プロセスが同時に書き込むと壊れる可能性。`lockfile-np` 等でファイルロックするか、atomic write を使う。

---

## 実装優先順位

1. `utils/config.ts` + `utils/xdg.ts` — 基盤
2. `api/client.ts` — Notion 接続・Rate Limit
3. `api/pages.ts` + `types/index.ts` — ページ取得・型変換
4. `commands/list.ts` + `commands/show.ts` — 基本コマンド
5. `cache/store.ts` + `cache/schema.ts` — キャッシュ
6. `render/markdown.ts` — MD 出力
7. `commands/tree.ts` — tree 表示
8. `api/blocks.ts` + `render/tree.ts` — ブロック操作
9. `commands/edit.ts` + `commands/delete.ts` — 書き込み系
10. `commands/cache.ts` — キャッシュ管理コマンド

---

## AIエージェントファースト設計哲学

nota の主要ユーザーはコンテキストが揮発するAIエージェントである。
以下の原則は、エージェントが誤解なく自律的に使えるCLIを目指したもの。

### 原則1：プリミティブと便利コマンドを分離する（UNIX哲学）

**プリミティブ**（仕様準拠・明示的・スクリプタブル）：
- 1つのことだけをやる
- `--json` で機械可読な出力を返す
- 入力は常に明示的なID（暗黙的な解決をしない）
- パイプでつなげる

**便利コマンド**（あるとしても）：
- プリミティブの組み合わせとして実装する
- 暗黙的な自動解決は「複数候補がある場合にどれを選ぶか」問題を生む

例：`nota db sources` → `nota db schema` / `nota db query` をパイプでつなぐ設計。
`nota db query <database_id>` で自動解決しない理由は、1 database が複数の data_source を持てるため。

### 原則2：エラーは「正解つき」で返す

AIエージェントはカットオフ後の仕様変更を知らない可能性がある。
エラーメッセージには：
- 何が間違っているか（事実）
- 正しいIDまたはコマンド（次のアクション）

を必ずセットで渡す。エージェントはエラーを読んで即リカバーできる。

```
"7c734c78..." is a database_id (Notion container), not a data_source_id.
nota db query and schema require a data_source_id.

Data sources for this database:
  9b0835dd-bf4d-4d52-8aa7-cf7d3f738117  Memo

Run: nota db sources 7c734c78...
Then: nota db query <data_source_id>
```

### 原則3：API仕様の変化を橋渡しするコマンドを作る

外部APIの仕様変更（Notion API 2025-09-03: `database_id` → `data_source_id`）により、
エージェントの学習データと実際の動作が乖離することがある。

対処：
- 旧概念 → 新概念への橋渡しコマンドを用意する（`nota db sources <database_id>`）
- `--help` の Examples にワークフローを明記する
- エラーメッセージで仕様変更の背景を説明する

### 原則4：`--help` は唯一の情報源として完結させる

コンテキストが揮発したエージェントが `nota --help` を叩いた瞬間から
迷わず動けるように、各コマンドの `--help` には：
- 必要な環境変数（`NOTION_TOKEN`）
- IDの取得元（どのコマンドで取得するか）
- 具体的なUsage例（コメント付き）

を含める。ドキュメントサイトを参照しなくても動ける自己完結性が目標。
