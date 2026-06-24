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
  bottle_ml   integer check (bottle_ml between 50 and 3000),
  status      text not null default 'active' check (status in ('active','hidden')),
  created_at  timestamptz not null default now()
);

alter table public.gin_bottle_prices enable row level security;

alter table public.gin_bottle_prices
  drop constraint if exists gin_bottle_prices_price_yen_check;
alter table public.gin_bottle_prices
  add constraint gin_bottle_prices_price_yen_check check (price_yen between 1 and 1000000);
alter table public.gin_bottle_prices
  drop constraint if exists gin_bottle_prices_bottle_ml_check;
alter table public.gin_bottle_prices
  add constraint gin_bottle_prices_bottle_ml_check check (bottle_ml between 50 and 3000);

revoke all on table public.gin_bottle_prices from anon;
revoke all on table public.gin_bottle_prices from authenticated;

grant insert (gin_name, price_yen, bottle_ml) on public.gin_bottle_prices to anon;
drop policy if exists "anon insert bottle price" on public.gin_bottle_prices;
create policy "anon insert bottle price"
  on public.gin_bottle_prices for insert to anon
  with check (status = 'active');

grant select (id, gin_name, price_yen, bottle_ml, created_at) on public.gin_bottle_prices to anon;
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


-- Bar Soutsu｜ボトル価格目安 自動収集シード
-- 生成日時（JST）: 2026/06/25 4:52:52
-- SQL投入対象: 84件 / CSV候補: 117件
-- 先に supabase_bottle_prices_setup.sql をRunしてテーブルを作成してください。
-- 価格は公開ページから機械抽出した「目安」です。
-- CSVには低信頼候補も残し、SQLは構造化データ/メタ価格中心の高信頼候補だけに絞っています。

insert into public.gin_bottle_prices (gin_name, price_yen, bottle_ml, status)
values
  ('AICHI Craft gin kiyosu', 2350, 500, 'active'),
  ('AKAYANE CRAFT GIN HEART 秋', 5280, 720, 'active'),
  ('AKAYANE CRAFT GIN 美風', 4400, 500, 'active'),
  ('AWA GIN', 5500, 720, 'active'),
  ('BEEFEATER Crown Jewel', 9070, 1000, 'active'),
  ('CACAO ETHIQUE BATCH NO.1', 3300, 375, 'active'),
  ('CACAO ETHIQUE T', 3300, 375, 'active'),
  ('CAMP Gin', 2310, 200, 'active'),
  ('CAORUNN Small Batch Scottish GIN', 2200, 700, 'active'),
  ('COTSWOLDS Old Tom Gin', 4950, 700, 'active'),
  ('CRESCENT', 15000, 500, 'active'),
  ('DRUMSHANBO GUNPOWDER IRISH GIN', 5170, 700, 'active'),
  ('EIRIN CRAFT YUZUGIN', 7920, 700, 'active'),
  ('EMPRESS 1908 ELDERFLOWER ROSE GIN', 4363, 750, 'active'),
  ('EMPRESS 1908 GIN', 3890, 750, 'active'),
  ('ETHICAL GIN LITTLE JOY SPIRITS', 3300, 375, 'active'),
  ('ETHICAL GIN LOSS IS MORE', 4125, 375, 'active'),
  ('FOUR PILLARS Chakging Seasons Gin', 4800, 700, 'active'),
  ('GARAPPA ~#1 CRAFT GIN~ 河童', 3630, 720, 'active'),
  ('GIN nez -銀鼠-', 10800, 200, 'active'),
  ('HAYMAN''S', 2850, 700, 'active'),
  ('HAYMAN''S Old Tom', 2530, 700, 'active'),
  ('HINATA', 5500, 750, 'active'),
  ('HOLON GIN', 5500, 500, 'active'),
  ('HOLON GIN AME', 5700, 500, 'active'),
  ('HOLON GIN SEASONAL 桜', 5700, 500, 'active'),
  ('HOLON GIN SEASONAL 梅紫蘇', 5900, 500, 'active'),
  ('HOLON GIN 晴', 5700, 500, 'active'),
  ('ISLE OF HARRIS GIN', 6600, 700, 'active'),
  ('JAPANESE GIN 翠', 1349, 700, 'active'),
  ('KOMASA Gin ほうじ茶', 3850, 500, 'active'),
  ('KOMASA Gin 桜島小みかん', 3850, 500, 'active'),
  ('KOMASA Gin 苺', 3850, 500, 'active'),
  ('LADY TRIỆU CONTEMPORARY VIETNAM GIN', 5600, 750, 'active'),
  ('MALFY GIN Con Limone', 4039, 700, 'active'),
  ('MARTIN MILLER''S GIN', 4730, 700, 'active'),
  ('MARTIN MILLER’S GIN 9MOONS', 14000, 350, 'active'),
  ('NAKATSU GIN CHITA BANANA', 3850, 500, 'active'),
  ('NAKATSU GIN RUBYGRAPEFRUIT', 3500, 500, 'active'),
  ('NAKATSU GIN（ 知多バナナ 3rd Batch ）', 3850, 500, 'active'),
  ('NORDES Atlantic Galician Gin', 4268, 700, 'active'),
  ('OFF TRAIL – Azeotrope #1 【New Pot】Beer Distilled Gin', 4730, 500, 'active'),
  ('OFF TRAIL – Azeotrope #2 【New Pot Blended】Malt Gin', 4730, 500, 'active'),
  ('ROKUMOJI Craft GIN 2023 Botanical Trip', 6000, 700, 'active'),
  ('SILENT POOL Gin', 4950, 700, 'active'),
  ('SILENT POOL Rare Citrus Gin', 5720, 700, 'active'),
  ('Sipsmith Lemon Drizzle Gin', 4550, 700, 'active'),
  ('SIPSMITH V.J.O.P BLACK', 4598, 700, 'active'),
  ('STILL DAM GIN NANKOU UME-スティルダムジン 南高梅-', 4950, 500, 'active'),
  ('STILL DAM GIN STOOM SHIPS', 2500, 375, 'active'),
  ('STILLDAM GIN 1st Anniversary Lemongrass & Bergomot', 2500, 375, 'active'),
  ('STILLDAM GIN ING 2nd dot', 2500, 375, 'active'),
  ('STILLDAM GIN NANKOU UME', 4950, 500, 'active'),
  ('STILLDAM GIN Roast & Smoke', 2500, 375, 'active'),
  ('STILLDAM GIN Saga mikan', 2500, 375, 'active'),
  ('STILLDAM GIN Standard', 2500, 375, 'active'),
  ('STILLDAM ING single dot', 2500, 375, 'active'),
  ('TANQUERAY Malacca Gin', 3058, 1000, 'active'),
  ('THE HERBALIST YASO GIN Limited Edition 03 Not Equal', 7480, 700, 'active'),
  ('TOKYO HACHIO GIN Classic（40%）', 4450, 500, 'active'),
  ('TOKYO HACHIO GIN Classic（45%）', 4450, 500, 'active'),
  ('Unbirthday 指宿 DRY GIN', 2200, 700, 'active'),
  ('Water Dragon Spirits', 3333, 700, 'active'),
  ('WELLNESS GIN', 6600, 500, 'active'),
  ('WHITLEY NEILL', 3335, 700, 'active'),
  ('WHITLEY NEILL Gooseberry', 4298, 700, 'active'),
  ('WHITLEY NEILL Quince', 3208, 700, 'active'),
  ('WHITLEY NEILL Raspberry', 3300, 700, 'active'),
  ('WHITLEY NEILL RHUBARB & GINGER GIN', 3335, 700, 'active'),
  ('アルケミエ', 5000, 500, 'active'),
  ('アルケミエ 4', 6200, 500, 'active'),
  ('アルケミエ ファーストエッセンス オレンジ＃12', 5500, 500, 'active'),
  ('アルケミエ 金木犀', 5500, 500, 'active'),
  ('アルケミエ 犬啼 ジュニパー', 5000, 500, 'active'),
  ('火の帆 KIBOU', 6490, 500, 'active'),
  ('火の帆 UMI', 8030, 500, 'active'),
  ('花物語', 3850, 700, 'active'),
  ('香の雫', 1034, 300, 'active'),
  ('香の森', 5192, 700, 'active'),
  ('香立', 2500, 700, 'active'),
  ('秋田杉', 1136, 200, 'active'),
  ('赤鳥居', 2420, 700, 'active'),
  ('草木酒フォレストジン', 2440, 500, 'active'),
  ('日の丸ジン 蔵風土 HINOMARU GIN CRAFT', 3850, 700, 'active');

NOTIFY pgrst, 'reload schema';
