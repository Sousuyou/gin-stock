-- ============================================================
-- Bar Soutsu｜ジン在庫カタログ：申請箱テーブル作成スクリプト
-- Supabase の SQL Editor にこの内容を貼り付けて「Run」する（1回だけ）。
--
-- 安全設計の要点：
--   ・店員(anon)は「投稿(INSERT)だけ」できる。読み取り/書き換え/削除は不可。
--   ・店員は status 列を設定できない（列単位GRANTで除外）。必ず 'pending' で着地する。
--     → 「承認済み」を偽って送りつけて事実確認を飛ばす、という攻撃が構造的に不可能。
--   ・承認(approved化)は SECRET キーかダッシュボードでしか行えない＝オーナーだけの操作。
--   ・列の長さ・度数の範囲はDB側のCHECKで弾く（クライアントJSは信用しない）。
-- ============================================================

-- 1) 申請箱テーブル
create table if not exists public.gin_submissions (
  id            bigint generated always as identity primary key,
  name          text not null check (char_length(name) between 1 and 200),
  kana          text not null check (char_length(kana) between 1 and 200),
  abv           numeric check (abv is null or (abv >= 0 and abv <= 100)),
  country       text check (country is null or char_length(country) <= 200),
  country_main  text not null check (char_length(country_main) between 1 and 60),
  note          text check (note is null or char_length(note) <= 2000),
  botanicals    text check (botanicals is null or char_length(botanicals) <= 2000),
  not_gin       boolean not null default false,
  source_note   text check (source_note is null or char_length(source_note) <= 500),
  submitted_by  text check (submitted_by is null or char_length(submitted_by) <= 100),
  status        text not null default 'pending'
                  check (status in ('pending','approved','rejected','promoted')),
  created_at    timestamptz not null default now()
);

-- 2) 行レベルセキュリティ(RLS)を有効化。
--    RLSが有効でポリシーが無いと、anon は何もできない（deny-by-default）。
alter table public.gin_submissions enable row level security;

-- 3) anon(公開キー)の権限を一旦すべて取り消し、INSERTを「特定の列だけ」許可する。
--    status / id / created_at は列に含めない＝店員はこれらを設定できない。
revoke all on table public.gin_submissions from anon;
grant insert (name, kana, abv, country, country_main, note, botanicals, not_gin, source_note, submitted_by)
  on public.gin_submissions to anon;

-- 3b) 深層防御：authenticated ロールの残存権限も剥がす。
--     Supabaseは初期化時に public スキーマのテーブルへ authenticated にも ALL を自動付与する。
--     本アプリはログイン(Auth)を使わないが、公開キーで誰でもサインアップして authenticated に
--     なれるため、残存ALLグラントを明示的に取り消して防御をRLS1点依存にしない。
--     ※ さらに万全を期すなら Authentication > Providers でサインアップ自体を無効化する。
revoke all on table public.gin_submissions from authenticated;

-- 4) INSERTのみ許可するRLSポリシー。status は必ず 'pending'（DBデフォルト）になる前提。
--    SELECT/UPDATE/DELETE のポリシーは「作らない」＝anonは読めない・消せない・書き換えられない。
drop policy if exists "anon insert only" on public.gin_submissions;
create policy "anon insert only"
  on public.gin_submissions
  for insert
  to anon
  with check (status = 'pending');

-- 5) 一覧の使い勝手用インデックス（任意）
create index if not exists gin_submissions_status_idx on public.gin_submissions (status, created_at desc);

-- ============================================================
-- 確認：以下は Supabase ダッシュボードで目視チェック（出荷ゲート）
--   ・Table Editor で gin_submissions に「RLS enabled」の鍵マークが付いている
--   ・Policies が「anon insert only」の1つだけ（SELECT/UPDATE/DELETE ポリシーは無い）
-- 承認の運用：
--   オーナーが内容を確認し、良い行だけ status を 'approved' に変える（ダッシュボード or SECRETキー）。
--   その後 promote_pending.py を実行すると approved 行が gins.json に昇格する。
-- ============================================================
