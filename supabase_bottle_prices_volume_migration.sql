-- ============================================================
-- Bar Soutsu｜ボトル価格目安：容量mlカラム追加マイグレーション
-- 既に gin_bottle_prices を作成済みの場合だけ、このSQLを1回Runしてください。
-- ============================================================

alter table public.gin_bottle_prices
  add column if not exists bottle_ml integer;

alter table public.gin_bottle_prices
  drop constraint if exists gin_bottle_prices_bottle_ml_check;
alter table public.gin_bottle_prices
  add constraint gin_bottle_prices_bottle_ml_check check (bottle_ml between 50 and 3000);

grant insert (gin_name, price_yen, bottle_ml) on public.gin_bottle_prices to anon;
grant select (id, gin_name, price_yen, bottle_ml, created_at) on public.gin_bottle_prices to anon;

NOTIFY pgrst, 'reload schema';
