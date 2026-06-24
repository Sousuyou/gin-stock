-- ============================================================
-- Bar Soutsu｜ジン在庫カタログ：ボトル価格目安 テーブル作成スクリプト
-- ★必ず「gin_submissions / gin_memos / gin_flavor_tags がある正しいプロジェクト」の SQL Editor で実行★
-- 貼り付けて「Run」する（1回だけ）。最後の NOTIFY でスキーマ再読込まで行う。
--
-- 仕様（メモ・風味タグ・香りの強さ・スタッフ評価と同じ安全設計）：
--   ・各ジン（gin_name）に、スタッフがボトル1本あたりの価格目安（円）を付けられる。
--   ・閲覧(SELECT)は全員可＝カタログのカードと詳細画面で共有表示する。
--   ・投稿(INSERT)は anon に許可するが、画面側でスタッフPINを通した人だけが保存できる作り。
--   ・値は履歴型で保存し、画面側では最新の active 行だけを採用する。
--   ・誤入力は Table Editor でその行の status を 'hidden' にすれば、次に新しい値が表示される。
-- ============================================================

create table if not exists public.gin_bottle_prices (
  id          bigint generated always as identity primary key,
  gin_name    text not null check (char_length(gin_name) between 1 and 200),
  price_yen   integer not null check (price_yen between 1 and 1000000),
  status      text not null default 'active' check (status in ('active','hidden')),
  created_at  timestamptz not null default now()
);

alter table public.gin_bottle_prices enable row level security;

alter table public.gin_bottle_prices
  drop constraint if exists gin_bottle_prices_price_yen_check;
alter table public.gin_bottle_prices
  add constraint gin_bottle_prices_price_yen_check check (price_yen between 1 and 1000000);

revoke all on table public.gin_bottle_prices from anon;
revoke all on table public.gin_bottle_prices from authenticated;

grant insert (gin_name, price_yen) on public.gin_bottle_prices to anon;
drop policy if exists "anon insert bottle price" on public.gin_bottle_prices;
create policy "anon insert bottle price"
  on public.gin_bottle_prices for insert to anon
  with check (status = 'active');

grant select (id, gin_name, price_yen, created_at) on public.gin_bottle_prices to anon;
drop policy if exists "anon read active bottle price" on public.gin_bottle_prices;
create policy "anon read active bottle price"
  on public.gin_bottle_prices for select to anon
  using (status = 'active');

create index if not exists gin_bottle_prices_name_idx on public.gin_bottle_prices (gin_name, created_at desc);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 確認（出荷ゲート）：
--   ・Table Editor で gin_bottle_prices に「RLS enabled」の鍵マーク
--   ・Policies は「anon insert bottle price」「anon read active bottle price」の2つだけ
-- 運用：
--   ・税込/税別や容量差が混ざるため、画面上では「目安」として扱う。
--   ・誤入力は Table Editor でその行の status を 'hidden' にすると即消える。
-- ============================================================
