# 次チャット引き継ぎメモ

このファイルは、チャットをクリアしても次の作業者がすぐ再開できるようにするための入口です。
次チャットでは、まずこのファイルと `git log -1 --oneline`、`git status --short --branch` を確認してください。

## 基本情報

- 作業場所: `/Users/Sousyou/Desktop/Claudeテスト用/gin-stock-repo`
- ローカル確認URL: `http://localhost:8788/`
- 公開URL: `https://sousuyou.github.io/gin-stock/`
- GitHub: `Sousuyou/gin-stock`
- ブランチ: `main`

## 進め方

- すべて日本語で対応する。
- コードコメントやドキュメントも基本は日本語にする。
- UI/機能実装は、仕様が曖昧な場合は先に「このような設計はいかがですか？」と確認する。
- ユーザーが「実装してください」「お願いします」「反映してOK」と明確に言った場合は、実装・検証・pushまで進めてよい。
- 返信の最後には、次に進める選択肢を5つ程度出す。

## 直近の重要変更

- 詳細小窓のスタッフ用パスワード入力欄を1か所に統合。
- 価格・容量ml・香りの強さ・スタッフ評価・風味タグ・情報ソースURL・スタッフメモは、共通の「スタッフ編集」解錠後に編集できる。
- スタッフパスワード欄は数字限定ではなく、英字を含む `soutsu2026` などを入力できる。
- 詳細小窓の「価格・香り・評価」は通常表示も縦型パネルに統一済み。
- 販売目安は原価率18%で計算。
- 価格データは `data/bottle_price_estimates_20260625.json` に全件分あり、未価格0件。

## キャッシュ関連

- `index.html` の `styles.css` / `app.js` はクエリ文字列で更新管理する。
- `boot.js` の `APP_BOOT_VERSION` を上げると、ローカル環境では古い Service Worker / Cache を掃除する。
- `service-worker.js` の `CACHE` も変更時に上げる。
- 公開側で古く見える場合は `https://sousuyou.github.io/gin-stock/cache-reset.html` を開いてから再確認する。

## 検証コマンド

```bash
cd /Users/Sousyou/Desktop/Claudeテスト用/gin-stock-repo
node --check app.js
node --check submit.js
node --check boot.js
node --check top/botanical-table/botanical-data.js
node --check tools/collect_bottle_prices.mjs
git diff --check
```

## 次チャット用プロンプト

```text
Bar Soutsu ツールズ / ジン在庫カタログの続きです。

作業場所:
/Users/Sousyou/Desktop/Claudeテスト用/gin-stock-repo

ローカル確認URL:
http://localhost:8788/

公開URL:
https://sousuyou.github.io/gin-stock/

GitHub:
Sousuyou/gin-stock
main ブランチ

まず `NEXT_CHAT_HANDOFF.md`、`git log -1 --oneline`、`git status --short --branch` を確認してください。

重要な進め方:
- すべて日本語で対応してください。
- コードコメントやドキュメントも基本は日本語。
- UI/機能実装は、曖昧な場合は先に「このような設計はいかがですか？」と確認してください。
- ただし、こちらが「実装してください」「お願いします」「反映してOK」と明確に言った場合は実装まで進めて大丈夫です。
- 返信の最後には、次に進める選択肢を5つくらい提案してください。

直近の状態:
- 詳細小窓のスタッフ用パスワード欄は1か所に統合済み。
- スタッフパスワードは数字限定ではなく、英字を含む既定 `soutsu2026` を入力できます。
- 価格・香り・評価・風味タグ・情報ソースURL・スタッフメモは、共通の「スタッフ編集」解錠後に編集できます。
- 販売目安は原価率18%で計算。
- 価格データは全件埋め済み。

まず現在の画面と最新コミットを確認して、次の作業に入ってください。
```
