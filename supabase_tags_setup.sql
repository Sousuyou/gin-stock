-- ============================================================
-- Bar Soutsu｜ジン在庫カタログ：風味タグ テーブル作成スクリプト
-- ★必ず「gin_submissions / gin_memos がある正しいプロジェクト」の SQL Editor で実行★
-- 貼り付けて「Run」する（1回だけ）。最後の NOTIFY でスキーマ再読込まで行う。
--
-- 仕様（メモ機能と同じ安全設計）：
--   ・各ジン（gin_name）に、スタッフが風味タグ（例：フローラル、シトラス…）を付け外しできる。
--   ・閲覧(SELECT)は全員可＝カタログの詳細画面・カード・絞り込みで使う。
--   ・投稿(INSERT)と削除(DELETE)は anon に許可するが、画面側でスタッフPINを通した人だけが操作できる作り。
--   ・status は anon から設定不可（列単位GRANTで除外）＝必ず 'active' で着地。
--   ・誤タグは画面側の×で取り消せる。Table Editor で status を 'hidden' にしても即・非表示。
--   ・1ジンに同じタグの重複行ができても、画面側で重複は除いて表示する。
-- ============================================================

create table if not exists public.gin_flavor_tags (
  id          bigint generated always as identity primary key,
  gin_name    text not null check (char_length(gin_name) between 1 and 200),
  tag         text not null check (char_length(tag) between 1 and 40),
  status      text not null default 'active' check (status in ('active','hidden')),
  created_at  timestamptz not null default now()
);

alter table public.gin_flavor_tags enable row level security;

revoke all on table public.gin_flavor_tags from anon;
revoke all on table public.gin_flavor_tags from authenticated;  -- 深層防御

grant insert (gin_name, tag) on public.gin_flavor_tags to anon;
drop policy if exists "anon insert tag" on public.gin_flavor_tags;
create policy "anon insert tag"
  on public.gin_flavor_tags for insert to anon
  with check (status = 'active');

grant select (id, gin_name, tag, created_at) on public.gin_flavor_tags to anon;
drop policy if exists "anon read active tag" on public.gin_flavor_tags;
create policy "anon read active tag"
  on public.gin_flavor_tags for select to anon
  using (status = 'active');

grant delete on public.gin_flavor_tags to anon;
drop policy if exists "anon delete active tag" on public.gin_flavor_tags;
create policy "anon delete active tag"
  on public.gin_flavor_tags for delete to anon
  using (status = 'active');

create index if not exists gin_flavor_tags_name_idx on public.gin_flavor_tags (gin_name);
create index if not exists gin_flavor_tags_tag_idx  on public.gin_flavor_tags (tag, created_at desc);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 確認（出荷ゲート）：
--   ・Table Editor で gin_flavor_tags に「RLS enabled」の鍵マーク
--   ・Policies は「anon insert tag」「anon read active tag」「anon delete active tag」の3つ
-- 運用：
--   ・誤タグは画面側の×で取り消せる。Table Editor で status を 'hidden' にしても即消える。
-- ============================================================
