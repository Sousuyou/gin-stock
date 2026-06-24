-- ============================================================
-- Bar Soutsu｜ジン在庫カタログ：スタッフ評価 テーブル作成スクリプト
-- ★必ず「gin_submissions / gin_memos / gin_flavor_tags がある正しいプロジェクト」の SQL Editor で実行★
-- 貼り付けて「Run」する（1回だけ）。最後の NOTIFY でスキーマ再読込まで行う。
--
-- 仕様（メモ・風味タグ・香りの強さと同じ安全設計）：
--   ・各ジン（gin_name）に、スタッフが共有評価（0〜10）を付けられる。
--   ・閲覧(SELECT)は全員可＝カタログのカードと詳細画面で共有表示する。
--   ・投稿(INSERT)は anon に許可するが、画面側でスタッフPINを通した人だけが保存できる作り。
--   ・値は履歴型で保存し、画面側では最新の active 行だけを採用する。
--   ・誤入力は Table Editor でその行の status を 'hidden' にすれば、次に新しい値が表示される。
-- ============================================================

create table if not exists public.gin_staff_ratings (
  id          bigint generated always as identity primary key,
  gin_name    text not null check (char_length(gin_name) between 1 and 200),
  rating      integer not null check (rating between 0 and 10),
  status      text not null default 'active' check (status in ('active','hidden')),
  created_at  timestamptz not null default now()
);

alter table public.gin_staff_ratings enable row level security;

alter table public.gin_staff_ratings
  drop constraint if exists gin_staff_ratings_rating_check;
alter table public.gin_staff_ratings
  add constraint gin_staff_ratings_rating_check check (rating between 0 and 10);

revoke all on table public.gin_staff_ratings from anon;
revoke all on table public.gin_staff_ratings from authenticated;

grant insert (gin_name, rating) on public.gin_staff_ratings to anon;
drop policy if exists "anon insert staff rating" on public.gin_staff_ratings;
create policy "anon insert staff rating"
  on public.gin_staff_ratings for insert to anon
  with check (status = 'active');

grant select (id, gin_name, rating, created_at) on public.gin_staff_ratings to anon;
drop policy if exists "anon read active staff rating" on public.gin_staff_ratings;
create policy "anon read active staff rating"
  on public.gin_staff_ratings for select to anon
  using (status = 'active');

create index if not exists gin_staff_ratings_name_idx on public.gin_staff_ratings (gin_name, created_at desc);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 確認（出荷ゲート）：
--   ・Table Editor で gin_staff_ratings に「RLS enabled」の鍵マーク
--   ・Policies は「anon insert staff rating」「anon read active staff rating」の2つだけ
-- 運用：
--   ・誤入力は Table Editor でその行の status を 'hidden' にすると即消える。
-- ============================================================
