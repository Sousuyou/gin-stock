# ジン在庫カタログ｜Bar Soutsu

店の在庫ジン（約983銘柄）を検索・絞り込みできるカタログアプリ。
名前・産地・ボタニカルで検索、国・度数で絞り込み、タップで詳細（ボタニカル・メモ）を表示。

## 構成
- `index.html` / `app.js` / `styles.css` … カタログ本体（PWA・ダークモード対応）
- `gins.json` … 銘柄データ（このファイルを書き換えると表示が変わる）
- `build_gins.py` … Googleスプレッドシート（公開CSV）から `gins.json` を作り直す
- `.github/workflows/update-stock.yml` … 毎日自動でデータ更新（手動実行も可）
- `sheet_source.txt` … 公開CSVのURLを書く場所
- `自動更新の設定手順.md` … 自動更新のセットアップ手順

## データ更新
スプレッドシートを編集すると、GitHub Actions が毎日 `gins.json` を作り直して反映する。
詳しくは [自動更新の設定手順.md](自動更新の設定手順.md) を参照。
