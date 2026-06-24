# ボトル価格目安機能 セットアップ（1回だけ・約3分）

各ジンに「ボトル1本あたりの価格目安」を、スタッフが共有で保存できる機能です。
全員が見られて、スタッフPINを入れた人だけが保存できます。

## 手順

1. 必ず `gin_submissions`、`gin_memos`、`gin_flavor_tags` があるSupabaseプロジェクトを開く
2. 左メニュー「SQL Editor」→「＋ New query」
3. このフォルダの `supabase_bottle_prices_setup.sql` の中身を全部コピーして貼り付け、Run
4. 「Success. No rows returned」と出ればOK
5. Table Editor に `gin_bottle_prices` が増えていれば完了

## 使い方

カタログでジンをタップ → 詳細の「ボトル価格目安」が出ます。
「＋ 価格目安を設定（スタッフ）」→ PIN → 価格を円で入力し、「保存」します。

## 価格の一括入力

`data/bottle_price_estimates_YYYYMMDD.sql` をSQL EditorでRunすると、Webから自動収集した価格目安をまとめて投入できます。
先にCSVをざっと確認して、違和感のある行があればSQLから削ってください。

## 運用メモ

- 値は履歴型で保存され、画面では最新の値だけを表示します。
- 税込/税別や容量差が混ざるため、厳密価格ではなく「料金感」として扱う想定です。
- 間違えた値は Table Editor → `gin_bottle_prices` → その行の `status` を `hidden` にすると消えます。
- SQL未実行の間は、保存ボタンの代わりに「保存先未設定」と表示されます。カタログ自体は通常どおり動きます。
