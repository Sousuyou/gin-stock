-- ============================================================
-- Bar Soutsu｜香りの強さ：0〜10対応の制約更新
-- 既に gin_aroma_strengths を作成済みの場合は、このSQLだけRunすればOK。
-- ============================================================

alter table public.gin_aroma_strengths
  drop constraint if exists gin_aroma_strengths_strength_check;

alter table public.gin_aroma_strengths
  add constraint gin_aroma_strengths_strength_check check (strength between 0 and 10);

NOTIFY pgrst, 'reload schema';

-- 確認:
-- strength が 0〜10 の整数を受け付けるようになればOK。
