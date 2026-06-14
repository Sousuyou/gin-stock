-- ============================================================
-- 追加設定：カタログに「仮登録（pending/approved）」を表示するため、
-- anon（公開キー）に “閲覧（SELECT）” を限定的に許可する。
-- 既に supabase_setup.sql を実行済みのプロジェクトで、これを1回だけ追加実行する。
--
-- 安全のための限定：
--   ・見せる列は「表示に使う列だけ」。submitted_by / source_note は見せない。
--   ・見せる行は status が 'pending' か 'approved' の行だけ。
--     'rejected'（却下＝スパム等）と 'promoted'（既にカタログ入り）は見せない。
--   ・INSERT は従来どおり列単位GRANT（statusは設定不可）なので、自己承認は引き続き不可能。
-- ============================================================

-- 表示用の列だけ SELECT を許可（submitted_by / source_note は除外）
grant select (id, name, kana, abv, country, country_main, note, botanicals, not_gin, status, created_at)
  on public.gin_submissions to anon;

-- pending / approved の行だけ読めるRLSポリシー
drop policy if exists "anon read pending" on public.gin_submissions;
create policy "anon read pending"
  on public.gin_submissions
  for select
  to anon
  using (status in ('pending', 'approved'));

-- ※ いたずら投稿が客の画面に出てしまった場合は、Table Editor でその行の
--   status を 'rejected' にする（または削除する）と、即座に表示から消えます。
