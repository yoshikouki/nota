## Summary
現状の実装は `list` / `show` / `tree` / `cache` の基本動線が動作し、`bun run typecheck` と `bun run build` は通っているため、最小限のCLIとしては成立しています。
一方で、`DESIGN.md` の中核方針（キャッシュ戦略、コマンド網羅、エラー方針）との乖離が大きく、仕様準拠という観点では未完成です。
特にキャッシュ周りは「stale時の返却」「ネットワーク障害時フォールバック」「無効化範囲」に問題があり、実運用での信頼性に直結します。
型安全性もいくつかの unsafe cast に依存しており、Notion APIの部分レスポンスで実行時クラッシュする余地があります。

## Issues
### Critical
1. `src/cache/store.ts:74`, `src/commands/list.ts:34`, `src/commands/show.ts:161`, `src/commands/tree.ts:166`  問題: `--cache` 指定時でも stale エントリは `null` 扱いされ、仕様の「staleでも返す」に反しています。さらに stale を返せないため、ネットワーク障害時のフォールバックが効きません。  推奨修正: `getCached*` に「staleでも返すモード」を追加し、`--cache` 時は stale 許容、通常時は fresh 優先 + stale-while-revalidate を実装してください。
2. `src/api/pages.ts:43`, `src/api/pages.ts:74`, `src/api/pages.ts:5`  問題: `pages.retrieve` / `search` の結果を `PageObjectResponse` に強制キャストしており、`PartialPageObjectResponse` が返るケースで `toNotaPage()` が `properties` アクセス時にクラッシュします。  推奨修正: SDKの型ガード（`"properties" in page` など）で完全ページのみを通し、部分レスポンスはスキップまたは明示エラーにしてください。

### Major
1. `src/index.ts:16`  問題: `DESIGN.md` で定義された `edit` / `delete` 系が未実装・未登録で、設計上のコマンドセットを満たしていません（`src/commands/edit.ts`, `src/commands/delete.ts`, `src/api/blocks.ts`, `src/render/markdown.ts` が存在しない）。  推奨修正: 設計の実装優先順位に沿って不足コマンドを追加し、CLIヘルプとREADMEの実態を一致させてください。
2. `src/commands/list.ts:27`, `src/api/pages.ts:61`  問題: `--sort` を `as SortOrder` で握りつぶしており不正値を黙認します。加えて `created` 指定時が `last_edited_time` 昇順になっており、名前と実挙動が一致していません。  推奨修正: commander側で列挙バリデーションを行い、不正値は即エラーにしてください。`created` を提供できないAPI制約があるならオプション自体を削除するか、ヘルプで明示してください。
3. `src/cache/store.ts:126`  問題: `invalidatePage()` が `pages` / `blocks` しか消さず、`searches` キャッシュ内の該当ページが残留します。削除・更新後に `list` / `tree` が古い情報を表示する可能性があります。  推奨修正: 全 `searches` エントリを走査して対象ページを除去するか、関連検索キャッシュを丸ごと無効化してください。
4. `src/cache/store.ts:48`  問題: キャッシュ破損時に `emptyStore()` へ silently fallback するだけで、破損ファイルを削除・退避しません。毎回同じ破損ファイルを読み続け、原因追跡も困難です。  推奨修正: 破損検知時に `cache.json.bak` へ退避して再初期化し、stderrへ警告を出してください。
5. `src/cache/store.ts:60`  問題: `write tmp -> rename` 自体は単一プロセスではほぼ原子的ですが、複数プロセス同時実行時の排他がなく、最後の書き込みで他プロセスの更新を失う race があります。  推奨修正: lockfile を導入して read-modify-write を排他化し、必要なら `fsync` で耐障害性を補強してください。
6. `src/commands/list.ts:45`  問題: `--json` が `NotaPage`（変換後）を出力しており、設計の「生JSON出力（パイプ用途）」とズレています。  推奨修正: `--json` の仕様を `raw` か `normalized` かで明確化し、少なくともヘルプ文言と実装を一致させてください。
7. `package.json:12`  問題: `bun test` が `No tests found` で失敗し、回帰防止の最低ラインがありません。  推奨修正: `api/pages`, `cache/store`, `commands/*` の主要分岐（特にエラー系）にユニットテストを追加してください。

### Minor
1. `src/utils/config.ts:7`  問題: `loadConfig()` が内部で `process.exit(1)` を実行しており、ユーティリティ層として再利用性・テスト容易性を下げています。  推奨修正: 例外を投げて呼び出し側（CLI境界）で終了コード制御する形へ統一してください。
2. `src/commands/cache.ts:20`  問題: 確認プロンプトが `stdout` を使うため、将来的に機械可読出力と混在した際にパイプを汚す可能性があります。  推奨修正: 対話プロンプトは `stderr` 出力へ寄せるか、`--json` 互換時は非対話化してください。
3. `src/cache/schema.ts:31`  問題: TTL判定が `>` のみで、`cached_at` が不正日時でも `NaN` 比較で stale 扱いされず残留します。  推奨修正: `Number.isFinite(timestamp)` を検証し、無効日時は stale とみなす防御を入れてください。

## Positives
- `commander` を中心にしたコマンド分離は読みやすく、責務の分割は概ね明確です。
- `withRetry()` をAPI呼び出し境界に寄せた設計は良く、再試行ロジックの重複を避けられています。
- `show` コマンドで事前取得したブロックを `NotionToMarkdown` に渡す実装（`createPrefetchedClient`）は、追加API呼び出しを抑える点で設計意図に沿った改善です。
- キャッシュスキーマを `version: 2` + raw SDKレスポンスで統一している点は、将来の変換ロジック変更に強い方針です。
- `bun run build`（`--compile`）が通っており、現時点でのBunバイナリ化は機能しています。

## Recommended next steps
1. まずキャッシュ方針を設計準拠に修正する（`--cache` で stale許容、通常時 fresh優先、stale-while-revalidate、ネットワーク障害時 stale fallback）。
2. APIレスポンスの unsafe cast を撤廃し、型ガードと明示的なエラー分岐を導入する。
3. `list --sort` の契約を整理し、実装可能なソートだけを提供する（不正値はCLIで即時弾く）。
4. `invalidatePage` の検索キャッシュ連動無効化と、キャッシュ破損時の自己修復（退避・再生成）を追加する。
5. `edit` / `delete` と対応API層を実装し、DESIGN.md との乖離を解消する。
6. 最低限のテストスイート（cache, api, command）を追加し、`bun test` をCIで必須化する。
