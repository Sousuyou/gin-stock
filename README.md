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
