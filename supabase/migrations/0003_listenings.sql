-- ============================================================================
-- 月月的工作台 · Supabase 迁移 0003_listenings
-- 内容：原创听力练习库（listenings）
-- 说明：与 0001/0002 同构（payload jsonb + 生成列 + RLS），不影响已存储数据
-- 用法：Supabase Dashboard → SQL Editor → 粘贴执行
-- ============================================================================

create table if not exists public.listenings (
  id          text primary key,
  user_id     uuid not null default auth.uid(),
  payload     jsonb not null default '{}'::jsonb,
  created_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);

alter table public.listenings
  add column if not exists slug    text    generated always as (payload->>'slug') stored,
  add column if not exists section int     generated always as ((payload->>'section')::int) stored,
  add column if not exists title   text    generated always as (payload->>'title') stored,
  add column if not exists level   text    generated always as (payload->>'level') stored,
  add column if not exists done    boolean generated always as ((payload->>'done')::boolean) stored,
  add column if not exists score   numeric generated always as ((payload->>'score')::numeric) stored,
  add column if not exists plays   int     generated always as ((payload->>'plays')::int) stored;

create unique index if not exists listenings_user_slug_uidx on public.listenings (user_id, slug);
create index if not exists listenings_user_section_idx on public.listenings (user_id, section);

-- RLS：只能读写自己的数据
alter table public.listenings enable row level security;
drop policy if exists "listenings_select_own" on public.listenings;
drop policy if exists "listenings_insert_own" on public.listenings;
drop policy if exists "listenings_update_own" on public.listenings;
drop policy if exists "listenings_delete_own" on public.listenings;
create policy "listenings_select_own" on public.listenings for select using (auth.uid() = user_id);
create policy "listenings_insert_own" on public.listenings for insert with check (auth.uid() = user_id);
create policy "listenings_update_own" on public.listenings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "listenings_delete_own" on public.listenings for delete using (auth.uid() = user_id);

drop trigger if exists trg_listenings_touch on public.listenings;
create trigger trg_listenings_touch before update on public.listenings
  for each row execute function public.touch_updated_at();

-- 便捷视图：听力练习进度
create or replace view public.v_listening_progress as
  select user_id,
         (payload->>'section')::int        as section,
         count(*)                          as total,
         count(*) filter (where (payload->>'done')::boolean) as done,
         coalesce(sum((payload->>'plays')::int), 0)          as plays,
         round(avg((payload->>'score')::numeric)
               filter (where (payload->>'done')::boolean), 0) as avg_score
  from public.listenings
  group by user_id, (payload->>'section')::int
  order by section;

-- 迁移记录
create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);
insert into public.schema_migrations (version) values ('0003_listenings')
on conflict (version) do nothing;
