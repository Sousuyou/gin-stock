-- ============================================================
-- Bar Soutsu｜ジン在庫カタログ：スタッフメモ テーブル作成スクリプト
-- Supabase の SQL Editor にこの内容を貼り付けて「Run」する（1回だけ）。
--
-- 仕様：
--   ・各ジン（gin_name）ごとに、スタッフが短いメモ（〜500字）を残せる。
--   ・閲覧(SELECT)は全員可＝カタログの詳細画面に表示される。
--   ・投稿(INSERT)・編集(UPDATE)・削除(DELETE)は anon に許可するが、画面側でスタッフPINを通した人だけが操作できる作り。
--     （PINは「一般客に書かせない」ための簡易ゲート。暗号的防御ではない。
--      公開して困る情報は書かない運用＋下記のstatus非表示化で守る。）
--   ・status は anon から設定不可（列単位GRANTで除外）＝必ず 'active' で着地する。
--   ・いたずら/不要メモは画面側の削除ボタンで取り消せる。Table Editor で status を 'hidden' にしても即・非表示。
-- ============================================================

-- 1) メモ用テーブル
create table if not exists public.gin_memos (
  id          bigint generated always as identity primary key,
  gin_name    text not null check (char_length(gin_name) between 1 and 200),
  memo        text not null check (char_length(memo) between 1 and 500),
  status      text not null default 'active' check (status in ('active','hidden')),
  created_at  timestamptz not null default now()
);

-- 2) 行レベルセキュリティ(RLS)を有効化（ポリシーが無ければ deny-by-default）
alter table public.gin_memos enable row level security;

-- 3) anon の既存権限を一旦すべて剥がし、必要な列だけ許可する
revoke all on table public.gin_memos from anon;
revoke all on table public.gin_memos from authenticated;  -- 深層防御（ログインは使わないが残存ALLを剥がす）

-- 4) 投稿：gin_name と memo の2列だけ。status/id/created_at は設定不可＝必ず active で着地
grant insert (gin_name, memo) on public.gin_memos to anon;
drop policy if exists "anon insert memo" on public.gin_memos;
create policy "anon insert memo"
  on public.gin_memos
  for insert
  to anon
  with check (status = 'active');

-- 5) 閲覧：表示用の列だけ／active の行だけ、全員(anon)に見せる
grant select (id, gin_name, memo, created_at) on public.gin_memos to anon;
drop policy if exists "anon read active memo" on public.gin_memos;
create policy "anon read active memo"
  on public.gin_memos
  for select
  to anon
  using (status = 'active');

-- 6) 編集：memo列だけ。id/gin_name/status/created_at は画面側から変更不可
grant update (memo) on public.gin_memos to anon;
drop policy if exists "anon update active memo" on public.gin_memos;
create policy "anon update active memo"
  on public.gin_memos
  for update
  to anon
  using (status = 'active')
  with check (status = 'active');

-- 7) 削除：active行だけ。画面側ではスタッフPIN後に表示される
grant delete on public.gin_memos to anon;
drop policy if exists "anon delete active memo" on public.gin_memos;
create policy "anon delete active memo"
  on public.gin_memos
  for delete
  to anon
  using (status = 'active');

-- 8) 銘柄ごとの取得を速くするインデックス
create index if not exists gin_memos_name_idx on public.gin_memos (gin_name, created_at desc);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 確認（出荷ゲート）：
--   ・Table Editor で gin_memos に「RLS enabled」の鍵マークが付いている
--   ・Policies は「anon insert memo」「anon read active memo」「anon update active memo」「anon delete active memo」の4つ
-- 運用：
--   ・不要メモ／いたずらは画面側の削除ボタンで取り消せる。Table Editor でその行の status を 'hidden' にしても即消える。
-- ============================================================
