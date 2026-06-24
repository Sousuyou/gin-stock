-- ============================================================
-- Bar Soutsu｜風味タグ：スタッフ取り消し用の削除権限だけ追加
-- 既に gin_flavor_tags を作成済みの場合は、このSQLだけRunすればOK。
-- ============================================================

grant delete on public.gin_flavor_tags to anon;

drop policy if exists "anon delete active tag" on public.gin_flavor_tags;
create policy "anon delete active tag"
  on public.gin_flavor_tags for delete to anon
  using (status = 'active');

NOTIFY pgrst, 'reload schema';

-- 確認:
-- Table Editor > gin_flavor_tags > Policies に
-- 「anon delete active tag」が追加されていればOK。
