# スタッフ申請機能 セットアップ手順（Supabase）

非エンジニア向けに、順番どおりやれば動くように書いています。所要 約30分。
※ コードを書く必要はありません。「画面の操作」と「2か所の貼り替え」だけです。

---

## 用意するもの
- Googleアカウントなど（Supabase登録用）
- このリポジトリ（gin-stock-repo）を編集・push できる環境

---

## ステップ1：Supabaseのプロジェクトを作る
1. https://supabase.com にアクセス →「Start your project」でサインアップ（無料）
2. 「New project」を作成。
   - Name：`gin-stock`（何でもOK）
   - Database Password：自動生成のままでOK（メモ不要）
   - Region：`Northeast Asia (Tokyo)` を選ぶと速い
3. 作成完了まで1〜2分待つ。

## ステップ2：申請箱テーブルを作る（SQLを1回貼るだけ）
1. 左メニュー「SQL Editor」→「New query」
2. このフォルダの **`supabase_setup.sql`** の中身を全部コピーして貼り付け
3. 右下「Run」を押す → 「Success」と出ればOK
4. 左メニュー「Table Editor」で `gin_submissions` ができていることを確認
   - テーブル名の横に**鍵マーク（RLS有効）**が付いていることを確認（重要）

## ステップ3：2種類のキーとURLを control panel から取得
左メニュー「Project Settings」→「API」を開く。
- **Project URL**（`https://xxxx.supabase.co`）… 後で使う
- **publishable / anon key**（`sb_publishable_...` または `anon` `public`）… 公開してよいキー
- **secret / service_role key**（`sb_secret_...`）… **絶対に公開しない**キー

> どれがどれか分からない時：`publishable`＝お店の表に貼ってよいカギ、`secret`＝金庫のカギ、と覚えてください。

## ステップ4：申請ページに「公開してよい情報」を入れる（2ファイル）
ここだけ手で貼り替えます（合計3か所）。

### (A) `submit.js` の冒頭2行
```
var SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"; ← ステップ3の Project URL に置換
var SUPABASE_KEY = "sb_publishable_REPLACE_ME";            ← publishable(anon) キーに置換
```

### (B) `staff.html` のセキュリティ設定（1か所）
`connect-src 'self' https://YOUR_PROJECT_REF.supabase.co;` の
`YOUR_PROJECT_REF` を、自分のプロジェクトの参照ID（URLの `https://●●●●.supabase.co` の●部分）に置き換える。

> ⚠ **(A)submit.js の URL と (B)staff.html の `YOUR_PROJECT_REF` は必ず同じプロジェクトに揃える。**
> 片方だけ直すと、セキュリティ設定(CSP)が送信をブロックして「通信エラー」で失敗します。
> 置き換えるプロジェクトURLは1つだけ。それを2か所に反映する、と覚えてください。

> ⚠ secret キーは staff.html / submit.js には**絶対に入れない**こと。入れてよいのは publishable(anon) キーだけ。

## ステップ5：スタッフパスワードを自店のものに変える（任意だが推奨）
既定パスワードは `soutsu2026`。変えるには：
1. 新しいスタッフパスワードを決める（例：`soutsu0401`）
2. ターミナルで次を実行してハッシュ値を出す：
   ```
   python3 -c "import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" soutsu0401
   ```
3. 出てきた長い文字列を、`submit.js` の `PIN_SHA256 = "..."` に貼り替える。
4. スタッフには新しいパスワード（`soutsu0401`）だけを伝える。

## ステップ6：公開して動作確認
1. 変更を push する（`git add -A` → commit → push）。数分でGitHub Pagesに反映。
2. `https://sousuyou.github.io/gin-stock/staff.html` を開く
3. スタッフパスワードを入力 →「解錠」→ フォームが出る
4. テストで1件送信 → 「申請箱に送りました」と出ればOK
5. Supabaseの Table Editor で `gin_submissions` に1行入っていることを確認

> このページは公開カタログのメニューからはリンクしていません。URLを知っているスタッフだけが使います。

## ステップ7：カタログに「仮登録」を表示する（重要・1回だけ）
申請したジンを、通常のカタログで検索したときに「⚠ 仮登録・未確認」付きで表示するための設定です。
これを実行しないと、カタログ側は仮登録を読み込めません（カタログ自体は今までどおり動きます）。

1. Supabaseの **SQL Editor** →「New query」
2. このフォルダの **`supabase_enable_read.sql`** の中身を全部コピーして貼り付け →「Run」
3. 「Success」と出ればOK。これでカタログで検索すると仮登録も出るようになります。

> 何を許可している？：公開キー(anon)に「pending/approved の表示用の列だけ」を**閲覧**許可します。
> スタッフ名などは見せず、却下(rejected)した行も見せません。投稿の自己承認は引き続き不可能です。

---

## 日々の運用（申請が来たら）
1. Supabaseの Table Editor で `gin_submissions` を開く
2. 内容を確認（必要ならClaudeと一緒に事実確認：度数・産地・ボタニカルの裏取り、重複チェック）
3. 載せてよい行は `status` を `approved` に変更（ダメな行は `rejected`）
4. オーナーの手元で承認用キーを設定して昇格スクリプトを実行：
   - このフォルダに `.supabase_secret.json` を作る（.gitignore済みでgitに乗らない）：
     ```json
     { "url": "https://xxxx.supabase.co", "secret_key": "sb_secret_..." }
     ```
   - 実行：`python3 promote_pending.py`
   - approved 行が `gins.json` に追加され、`count`/`version` が自動更新される
5. `gins.json` の差分を確認して push → 公開カタログに反映

> **カタログ表示との関係**：`pending`／`approved` の行は「仮登録」としてカタログに出ます。
> `rejected`（却下）にした行や、`promoted`（正式登録済み）にした行は、カタログから自動で消えます。
> いたずら投稿が出てしまったら、その行を `rejected` にする（または削除する）だけで即座に非表示になります。

---

## よくある質問
- **Q. publishable キーをページに置いて大丈夫？**
  A. はい。Supabase公式が「公開してよい」と明記しています。守りはキーの秘密ではなく権限設定(RLS)で、
  店員は「投稿(INSERT)」しかできません（読み取り・書き換え・削除は不可）。

- **Q. 無料版で困ることは？**
  A. 7日間アクセスが無いとプロジェクトが自動で一時停止します。再開はダッシュボードのボタン1つ。
  送信が失敗した時はスタッフ画面に「失敗しました」と必ず出るので、取りこぼしには気づけます。
  止まるのが嫌なら Pro（月$25）にすると一時停止しません。

- **Q. 間違えてキーが漏れたら？**
  A. Project Settings → API でキーをローテート（作り直し）し、submit.js を貼り替えて再push。
  secret キーが漏れた場合は最優先で即ローテートしてください。
