# ジン在庫カタログ｜Bar Soutsu

店の在庫ジン（約983銘柄）を検索・絞り込みできるカタログアプリ。
名前・産地・ボタニカルで検索、国・度数で絞り込み、タップで詳細（ボタニカル・メモ）を表示。

公開URL: https://sousuyou.github.io/gin-stock/

## 構成
- `index.html` / `app.js` / `styles.css` … カタログ本体（PWA・ダークモード対応）
- `gins.json` … **元データ（マスター）。このファイルがすべての元。** 書き換えると表示が変わる
- `export_csv.py` … `gins.json` から手元ファイル更新用のCSVを書き出す

## データ運用（2026-06-09〜）
**この `gins.json` が元データ（マスター）。** Googleスプレッドシートや自動更新は使わない。

- データの追加・修正は `gins.json` を直接編集する。
- 手元用のCSVが必要なときは `python3 export_csv.py` を実行 → `ジン在庫_最新版.csv` ができる
  （Excelでそのまま開ける。UTF-8 BOM付きで文字化けしない）。

### gins.json の形
```
{ "version": 8, "count": 983, "gins": [
  { "name": 銘柄名, "kana": カタカナ, "abv": 度数(数値), "country": 国,
    "country_main": 国の大分類, "note": 備考, "botanicals": ボタニカル }, ...
] }
```
`country_main` は `国（東京：蔵前）` → `日本` のように大分類を入れる（絞り込み用）。
並び順はカタカナ優先。データを足したら `version` を1つ上げるとキャッシュが確実に更新される。

## スタッフ用「新規ジン申請」機能（Supabase）

店員が在庫リストにないジンを申請できる仕組み。**送信だけでは公開カタログ(gins.json)は変わらない**。
オーナーが事実確認したものだけが反映される（精度を守る関所）。

### 流れ
1. 店員が `staff.html`（スタッフ専用・PINで解錠）から銘柄を入力 → Supabaseの「申請箱」へ送信
2. 送信行は必ず `status='pending'` で着地（店員は承認できない＝自己承認は構造的に不可能）
3. **カタログ表示**：`pending`／`approved` の行は、通常のカタログ検索に「⚠ 仮登録・未確認」付きで表示される
   （`app.js` が Supabase から閲覧。`rejected`/`promoted` は非表示）
4. オーナーがSupabaseで内容を確認 → 良い行だけ `status='approved'` に変更（NGは `rejected`）
5. `python3 promote_pending.py` 実行 → approved 行を `gins.json` に追記し、`count`/`version` 更新
6. 差分を確認して push（CSVが必要なら `python3 export_csv.py`）

### 情報の確からしさバッジ
- `gins.json` の各銘柄に任意の `unverified: true` フラグ。**ボタニカル欄が「メーカー非公開／要確認」の銘柄（約66件）**に付与済みで、カタログに「要確認」バッジが出る。
- 仮登録（Supabaseの申請）は `_provisional`（実行時フラグ）で「⚠ 仮登録・未確認」バッジ。
- 公開カタログが申請箱を読むため `index.html` の CSP `connect-src` に Supabase を追加。閲覧許可は `supabase_enable_read.sql` で設定（表示用の列・pending/approvedのみ）。

### 構成ファイル
- `staff.html` / `submit.js` … スタッフ用申請ページ（公開カタログとは分離・公開ナビからリンクしない）
- `supabase_setup.sql` … 申請箱テーブル＋権限設定（Supabaseで1回だけ実行）
- `promote_pending.py` … 承認済みを `gins.json` に昇格させる（オーナーが手元で実行）
- 詳しいセットアップ手順は `STAFF_SETUP.md` を参照

### 鍵とPINの扱い（重要）
- `submit.js` に入れてよいのは **publishable(anon) キー**のみ（公開してよいキー。守りはRLS）。
- **SECRETキー**（`sb_secret_...`）はRLSをバイパスする全権限。`promote_pending.py` 用に
  `.supabase_secret.json`（.gitignore済み）か環境変数からのみ読む。**リポジトリ・公開ページに絶対置かない。**
- PINはソースに平文で置かずSHA-256で照合。ただし「一般客の目に触れさせない」ための簡易ゲートで、
  暗号的な防御ではない。本当の防御はRLS（店員は投稿のみ）。
