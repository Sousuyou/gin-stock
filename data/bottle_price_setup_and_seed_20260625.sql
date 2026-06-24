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
-- 生成日時（JST）: 2026/06/25 4:14:04
-- SQL投入対象: 84件 / CSV候補: 117件
-- 先に supabase_bottle_prices_setup.sql をRunしてテーブルを作成してください。
-- 価格は公開ページから機械抽出した「目安」です。
-- CSVには低信頼候補も残し、SQLは構造化データ/メタ価格中心の高信頼候補だけに絞っています。

insert into public.gin_bottle_prices (gin_name, price_yen, bottle_ml, status)
values
  -- 公式通販 / https://onikoroshi-online.jp/SHOP/GI00001.html
  ('AICHI Craft gin kiyosu', 2350, 500, 'active'),
  -- 酒販店 / https://www.hasegawasaketen.com/eshop/products/detail/11728
  ('AKAYANE CRAFT GIN HEART 秋', 5280, 720, 'active'),
  -- 酒販店 / https://shopping.kimijimaya.co.jp/view/item/000000007139
  ('AKAYANE CRAFT GIN 美風', 4400, 500, 'active'),
  -- 公式通販 / https://nissin-shurui.com/?pid=147438729
  ('AWA GIN', 5500, 720, 'active'),
  -- 酒販店 / https://www.miraido-onlineshop.com/item/5-beefeater-cj/
  ('BEEFEATER Crown Jewel', 9070, 1000, 'active'),
  -- 公式通販 / https://shop.ethicalspirits.jp/products/cacao-ethique-batch7
  ('CACAO ETHIQUE BATCH NO.1', 3300, 375, 'active'),
  -- 公式通販 / https://shop.ethicalspirits.jp/products/cacao-ethique-batch7
  ('CACAO ETHIQUE T', 3300, 375, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/23513
  ('CAMP Gin', 2310, 200, 'active'),
  -- 酒販店 / https://www.suzusake.com/SHOP/02075.html
  ('CAORUNN Small Batch Scottish GIN', 2200, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/18026
  ('COTSWOLDS Old Tom Gin', 4950, 700, 'active'),
  -- ふるさと納税 / https://www.furusato-tax.jp/product/detail/43202/5960606
  ('CRESCENT', 15000, 500, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/22941
  ('DRUMSHANBO GUNPOWDER IRISH GIN', 5170, 700, 'active'),
  -- 公式通販 / https://eirin0088.base.shop/items/81497456
  ('EIRIN CRAFT YUZUGIN', 7920, 700, 'active'),
  -- 酒販店 / https://www.syurui.co.jp/products/8989
  ('EMPRESS 1908 ELDERFLOWER ROSE GIN', 4363, 750, 'active'),
  -- 酒販店 / https://www.syurui.co.jp/products/4596
  ('EMPRESS 1908 GIN', 3890, 750, 'active'),
  -- 共同開発元 / https://krispykreme.jp/pr/pr-10559.html
  ('ETHICAL GIN LITTLE JOY SPIRITS', 3300, 375, 'active'),
  -- 酒販店 / https://field-to-table.jp/products/ethical-gin-loss-is-more-gin
  ('ETHICAL GIN LOSS IS MORE', 4125, 375, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/17718
  ('FOUR PILLARS Chakging Seasons Gin', 4800, 700, 'active'),
  -- 酒販店 / https://store.shopping.yahoo.co.jp/kishuichibanya/cg-016.html
  ('GARAPPA ~#1 CRAFT GIN~ 河童', 3630, 720, 'active'),
  -- 酒販店 / https://store.shopping.yahoo.co.jp/nondonkai/10015847.html
  ('GIN nez -銀鼠-', 10800, 200, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/8466
  ('HAYMAN''S', 2850, 700, 'active'),
  -- 酒販店 / https://www.miraido-onlineshop.com/item/5-hayman-old-tom/
  ('HAYMAN''S Old Tom', 2530, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/14920
  ('HINATA', 5500, 750, 'active'),
  -- 酒販店 / https://shop.andspirits.com/products/holon
  ('HOLON GIN', 5500, 500, 'active'),
  -- 公式 / https://holongin.com/pages/holon-gin-amehare-release
  ('HOLON GIN AME', 5700, 500, 'active'),
  -- 公式 / https://holongin.com/pages/holongin_seasonal_spring
  ('HOLON GIN SEASONAL 桜', 5700, 500, 'active'),
  -- 公式 / https://holongin.com/products/holon-gin-seasonal-%E6%A2%85%E7%B4%AB%E8%98%87-500ml
  ('HOLON GIN SEASONAL 梅紫蘇', 5900, 500, 'active'),
  -- 公式 / https://holongin.com/pages/holon-gin-amehare-release
  ('HOLON GIN 晴', 5700, 500, 'active'),
  -- 酒販店 / https://www.shinanoya-tokyo.jp/view/item/000000015964
  ('ISLE OF HARRIS GIN', 6600, 700, 'active'),
  -- 酒販店 / https://likaman.net/view/item/000000008571
  ('JAPANESE GIN 翠', 1349, 700, 'active'),
  -- 公式 / https://komasagin.com/hojicha/
  ('KOMASA Gin ほうじ茶', 3850, 500, 'active'),
  -- 公式 / https://komasagin.com/komikan/
  ('KOMASA Gin 桜島小みかん', 3850, 500, 'active'),
  -- 公式 / https://komasagin.com/ichigo/
  ('KOMASA Gin 苺', 3850, 500, 'active'),
  -- 酒販店 / https://gacraftspirits.com/products/lady-trieu-gin-750ml
  ('LADY TRIỆU CONTEMPORARY VIETNAM GIN', 5600, 750, 'active'),
  -- 酒販店 / https://www.syurui.co.jp/products/1301
  ('MALFY GIN Con Limone', 4039, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/12072
  ('MARTIN MILLER''S GIN', 4730, 700, 'active'),
  -- 輸入元 / https://union-liquors.com/products/%E3%83%9E%E3%83%BC%E3%83%86%E3%82%A3%E3%83%B3%E3%83%BB%E3%83%9F%E3%83%A9%E3%83%BC%E3%82%BA%E3%83%BB%E3%82%B8%E3%83%B3-9%E3%83%A0%E3%83%BC%E3%83%B3%E3%82%BA/
  ('MARTIN MILLER’S GIN 9MOONS', 14000, 350, 'active'),
  -- 公式通販 / https://nakatsugin.thebase.in/items/54976135
  ('NAKATSU GIN CHITA BANANA', 3850, 500, 'active'),
  -- 酒販店 / https://www.saketry.com/208940.html
  ('NAKATSU GIN RUBYGRAPEFRUIT', 3500, 500, 'active'),
  -- 酒販店 / https://niigata-hasegawaya.com/products/nakatsu-gin-%E7%9F%A5%E5%A4%9A%E3%83%90%E3%83%8A%E3%83%8A-3rd-batch
  ('NAKATSU GIN（ 知多バナナ 3rd Batch ）', 3850, 500, 'active'),
  -- 酒販店 / https://store.shopping.yahoo.co.jp/syupoppo/nordes-atlantic-galisian-gin.html
  ('NORDES Atlantic Galician Gin', 4268, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/19983
  ('OFF TRAIL – Azeotrope #1 【New Pot】Beer Distilled Gin', 4730, 500, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/19983
  ('OFF TRAIL – Azeotrope #2 【New Pot Blended】Malt Gin', 4730, 500, 'active'),
  -- 酒販店 / https://sakenokadoya.com/rokumoji-botanical-trip/
  ('ROKUMOJI Craft GIN 2023 Botanical Trip', 6000, 700, 'active'),
  -- 酒販店 / https://shop.andspirits.com/products/silent-pool-gin
  ('SILENT POOL Gin', 4950, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/18755
  ('SILENT POOL Rare Citrus Gin', 5720, 700, 'active'),
  -- 酒販店 / https://item.rakuten.co.jp/sakaeyahonten/sipsmith_lemon/
  ('Sipsmith Lemon Drizzle Gin', 4550, 700, 'active'),
  -- 酒販店 / https://www.miraido-onlineshop.com/item/5-sip-smith-vjop-ldg/
  ('SIPSMITH V.J.O.P BLACK', 4598, 700, 'active'),
  -- 酒販店 / https://sakeroman.com/products/gin-stilldam-gin-shiso-ume
  ('STILL DAM GIN NANKOU UME-スティルダムジン 南高梅-', 4950, 500, 'active'),
  -- 公式 / https://www.stilldam.saga.jp/products.html
  ('STILL DAM GIN STOOM SHIPS', 2500, 375, 'active'),
  -- 公式 / https://www.stilldam.saga.jp/products.html
  ('STILLDAM GIN 1st Anniversary Lemongrass & Bergomot', 2500, 375, 'active'),
  -- 公式 / https://www.stilldam.saga.jp/products.html
  ('STILLDAM GIN ING 2nd dot', 2500, 375, 'active'),
  -- 酒販店 / https://sakeroman.com/products/gin-stilldam-gin-shiso-ume
  ('STILLDAM GIN NANKOU UME', 4950, 500, 'active'),
  -- 公式 / https://www.stilldam.saga.jp/products.html
  ('STILLDAM GIN Roast & Smoke', 2500, 375, 'active'),
  -- 公式 / https://www.stilldam.saga.jp/products.html
  ('STILLDAM GIN Saga mikan', 2500, 375, 'active'),
  -- 公式 / https://www.stilldam.saga.jp/products.html
  ('STILLDAM GIN Standard', 2500, 375, 'active'),
  -- 公式 / https://www.stilldam.saga.jp/products.html
  ('STILLDAM ING single dot', 2500, 375, 'active'),
  -- 酒販店 / https://www.miraido-onlineshop.com/item/5-tanqueray-mj/
  ('TANQUERAY Malacca Gin', 3058, 1000, 'active'),
  -- 酒販店 / https://www.shinanoya-tokyo.jp/view/item/000000021068
  ('THE HERBALIST YASO GIN Limited Edition 03 Not Equal', 7480, 700, 'active'),
  -- 酒販店 / https://ginlabliquor.base.shop/items/90189280
  ('TOKYO HACHIO GIN Classic（40%）', 4450, 500, 'active'),
  -- 酒販店 / https://ginlabliquor.base.shop/items/90189280
  ('TOKYO HACHIO GIN Classic（45%）', 4450, 500, 'active'),
  -- 酒販店 / https://www.higoya.co.jp/c/kuramoto/kagoshima/nansatsu/oj/oj93
  ('Unbirthday 指宿 DRY GIN', 2200, 700, 'active'),
  -- プレスリリース / https://prtimes.jp/main/html/rd/p/000000032.000087270.html
  ('Water Dragon Spirits', 3333, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/22843
  ('WELLNESS GIN', 6600, 500, 'active'),
  -- 酒販店 / https://www.syurui.co.jp/products/3463
  ('WHITLEY NEILL', 3335, 700, 'active'),
  -- 酒販店 / https://store.shopping.yahoo.co.jp/enokishouten/3r-406g-qk3c.html
  ('WHITLEY NEILL Gooseberry', 4298, 700, 'active'),
  -- 酒販店 / https://www.syurui.co.jp/products/3486
  ('WHITLEY NEILL Quince', 3208, 700, 'active'),
  -- 輸入元 / https://shop.andspirits.com/products/whitley-neill-raspberry-gin-uitutoriniru-razuberizin
  ('WHITLEY NEILL Raspberry', 3300, 700, 'active'),
  -- 酒販店 / https://www.syurui.co.jp/products/3513
  ('WHITLEY NEILL RHUBARB & GINGER GIN', 3335, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/20279
  ('アルケミエ', 5000, 500, 'active'),
  -- 酒販店 / https://www.shinanoya-tokyo.jp/view/item/000000015610
  ('アルケミエ 4', 6200, 500, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/23969
  ('アルケミエ ファーストエッセンス オレンジ＃12', 5500, 500, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/25568
  ('アルケミエ 金木犀', 5500, 500, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/20279
  ('アルケミエ 犬啼 ジュニパー', 5000, 500, 'active'),
  -- 酒販店 / https://unga-plus.com/products/155230818
  ('火の帆 KIBOU', 6490, 500, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/23115
  ('火の帆 UMI', 8030, 500, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/18858
  ('花物語', 3850, 700, 'active'),
  -- 公式 / https://www.yomeishu.co.jp/herb_liqueur/kanosizuku/
  ('香の雫', 1034, 300, 'active'),
  -- 公式 / https://www.yomeishu.co.jp/herb_liqueur/kanomori/
  ('香の森', 5192, 700, 'active'),
  -- 酒販店 / https://store.musashiya-net.co.jp/products/detail/16572
  ('香立', 2500, 700, 'active'),
  -- 公式 / https://www.oenon.jp/product/liqueur-spirits/other/akitasugi-gin.html
  ('秋田杉', 1136, 200, 'active'),
  -- 公式通販 / https://www.hizennya.com/c/other_sake/n-spirits/n-gin/a-62-2
  ('赤鳥居', 2420, 700, 'active'),
  -- 公式通販 / https://nihonkusakilab.com/products/%E8%8D%89%E6%9C%A8%E9%85%92%E3%83%95%E3%82%A9%E3%83%AC%E3%82%B9%E3%83%88%E3%82%B8%E3%83%B3%E5%B0%8F
  ('草木酒フォレストジン', 2440, 500, 'active'),
  -- 公式 / https://hinomaruwhisky.com/products/%E6%97%A5%E3%81%AE%E4%B8%B8%E3%82%B8%E3%83%B3-%E8%94%B5%E9%A2%A8%E5%9C%9F
  ('日の丸ジン 蔵風土 HINOMARU GIN CRAFT', 3850, 700, 'active');

NOTIFY pgrst, 'reload schema';
