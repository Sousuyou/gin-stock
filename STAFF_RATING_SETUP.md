# スタッフ評価機能 セットアップ（1回だけ・約3分）

各ジンに「スタッフ評価」0〜10を、スタッフが共有で保存できる機能です。
全員が見られて、スタッフPINを入れた人だけが保存できます。

## 手順

1. 必ず `gin_submissions`、`gin_memos`、`gin_flavor_tags` があるSupabaseプロジェクトを開く
2. 左メニュー「SQL Editor」→「＋ New query」
3. このフォルダの `supabase_staff_ratings_setup.sql` の中身を全部コピーして貼り付け、Run
4. 「Success. No rows returned」と出ればOK
5. Table Editor に `gin_staff_ratings` が増えていれば完了

## 使い方

カタログでジンをタップ → 詳細の「スタッフ評価」が出ます。
「＋ 評価を設定（スタッフ）」→ PIN → 0〜10の星を選び、「保存」します。

## 運用メモ

- 値は履歴型で保存され、画面では最新の値だけを表示します。
- 間違えた値は Table Editor → `gin_staff_ratings` → その行の `status` を `hidden` にすると消えます。
- SQL未実行の間は、保存ボタンの代わりに「保存先未設定」と表示されます。カタログ自体は通常どおり動きます。
