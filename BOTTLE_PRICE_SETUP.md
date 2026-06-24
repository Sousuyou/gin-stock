# ボトル価格目安機能 セットアップ（1回だけ・約3分）

各ジンに「ボトル1本あたりの価格目安」と「容量ml」を、スタッフが共有で保存できる機能です。
全員が見られて、スタッフPINを入れた人だけが保存できます。

## 手順

1. 必ず `gin_submissions`、`gin_memos`、`gin_flavor_tags` があるSupabaseプロジェクトを開く
2. 左メニュー「SQL Editor」→「＋ New query」
3. このフォルダの `supabase_bottle_prices_setup.sql` の中身を全部コピーして貼り付け、Run
4. 「Success. No rows returned」と出ればOK
5. Table Editor に `gin_bottle_prices` が増えていれば完了

## 使い方

カタログでジンをタップ → 詳細の「ボトル価格」が出ます。
「＋ 価格目安を設定（スタッフ）」→ PIN → 価格と容量mlを入力し、「保存」します。
30ml原価は `価格 × 30 ÷ 容量ml` で自動表示されます。
販売目安は30ml原価をもとに、原価率22〜30%程度の範囲で自動表示します。

## 既に価格テーブルを作成済みの場合

容量mlを保存できるようにするには、短い `supabase_bottle_prices_volume_migration.sql` だけをSQL EditorでRunしてください。
未実行でも画面は動きますが、その場合は同梱データの容量で30ml原価を表示します。

## 価格の一括入力

`data/bottle_price_estimates_YYYYMMDD.sql` をSQL EditorでRunすると、Webから自動収集した価格目安をまとめて投入できます。
先にCSVをざっと確認して、違和感のある行があればSQLから削ってください。

アプリ同梱の `data/bottle_price_estimates_YYYYMMDD.json` は、価格ソースを確認できた実売データだけを入れています。ソース未確認の自動推定価格は表示しません。

## 運用メモ

- 値は履歴型で保存され、画面では最新の値だけを表示します。
- 税込/税別や容量差が混ざるため、厳密価格ではなく「料金感」として扱う想定です。
- 詳細小窓では、銘柄情報ソースと価格ソースを分けて表示します。
- 間違えた値は Table Editor → `gin_bottle_prices` → その行の `status` を `hidden` にすると消えます。
- SQL未実行の間は、保存ボタンの代わりに「保存先未設定」と表示されます。カタログ自体は通常どおり動きます。
