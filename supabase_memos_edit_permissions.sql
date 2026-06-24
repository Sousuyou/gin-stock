-- ============================================================
-- Bar Soutsu｜スタッフメモ：編集・削除権限の追加
-- 既に gin_memos を作成済みの場合は、このSQLだけRunすればOK。
-- ============================================================

grant update (memo) on public.gin_memos to anon;
drop policy if exists "anon update active memo" on public.gin_memos;
create policy "anon update active memo"
  on public.gin_memos
  for update
  to anon
  using (status = 'active')
  with check (status = 'active');

grant delete on public.gin_memos to anon;
drop policy if exists "anon delete active memo" on public.gin_memos;
create policy "anon delete active memo"
  on public.gin_memos
  for delete
  to anon
  using (status = 'active');

NOTIFY pgrst, 'reload schema';

-- 確認:
-- Policies に「anon update active memo」「anon delete active memo」が追加されればOK。
