-- ============================================================
-- Bar Soutsu｜ジン在庫カタログ：情報ソースURL テーブル作成スクリプト
-- ★必ず「gin_submissions / gin_memos / gin_flavor_tags がある正しいプロジェクト」の SQL Editor で実行★
-- 貼り付けて「Run」する（1回だけ）。最後の NOTIFY でスキーマ再読込まで行う。
--
-- 仕様（メモ・風味タグと同じ安全設計）：
--   ・各ジン（gin_name）に、公式サイト・輸入元・蒸溜所などのURLを紐付けられる。
--   ・閲覧(SELECT)は全員可＝カタログの詳細画面に表示する。
--   ・投稿(INSERT)と削除(DELETE)は anon に許可するが、画面側でスタッフPINを通した人だけが操作できる作り。
--   ・URLは http / https のみ許可する。
--   ・status は anon から設定不可（列単位GRANTで除外）＝必ず 'active' で着地。
-- ============================================================

create table if not exists public.gin_info_sources (
  id          bigint generated always as identity primary key,
  gin_name    text not null check (char_length(gin_name) between 1 and 200),
  label       text not null default '情報ソース' check (char_length(label) between 1 and 80),
  url         text not null check (char_length(url) between 8 and 500 and url ~* '^https?://'),
  status      text not null default 'active' check (status in ('active','hidden')),
  created_at  timestamptz not null default now()
);

alter table public.gin_info_sources enable row level security;

revoke all on table public.gin_info_sources from anon;
revoke all on table public.gin_info_sources from authenticated;

grant insert (gin_name, label, url) on public.gin_info_sources to anon;
drop policy if exists "anon insert info source" on public.gin_info_sources;
create policy "anon insert info source"
  on public.gin_info_sources for insert to anon
  with check (status = 'active' and url ~* '^https?://');

grant select (id, gin_name, label, url, created_at) on public.gin_info_sources to anon;
drop policy if exists "anon read active info source" on public.gin_info_sources;
create policy "anon read active info source"
  on public.gin_info_sources for select to anon
  using (status = 'active');

grant delete on public.gin_info_sources to anon;
drop policy if exists "anon delete active info source" on public.gin_info_sources;
create policy "anon delete active info source"
  on public.gin_info_sources for delete to anon
  using (status = 'active');

create index if not exists gin_info_sources_name_idx on public.gin_info_sources (gin_name, created_at desc);
create index if not exists gin_info_sources_url_idx on public.gin_info_sources (url);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 確認（出荷ゲート）：
--   ・Table Editor で gin_info_sources に「RLS enabled」の鍵マーク
--   ・Policies は「anon insert info source」「anon read active info source」「anon delete active info source」の3つ
-- 運用：
--   ・誤URLは画面側の削除ボタンで取り消せる。Table Editor で status を 'hidden' にしても即消える。
-- ============================================================
