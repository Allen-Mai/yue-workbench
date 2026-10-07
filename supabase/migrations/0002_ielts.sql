-- ============================================================================
-- 月月的工作台 · Supabase 迁移 0002_ielts
-- 内容：雅思课程体系（courses / lessons） + 词库分类字段索引
-- 特性：与 0001 同构（payload jsonb + 生成列 + RLS），不影响已存储数据
-- 用法：Supabase Dashboard → SQL Editor → 粘贴执行
-- ============================================================================

-- ---------------------------------------------------------------------------
-- courses · 雅思课程（听力 / 阅读 / 写作 / 口语）
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id          text primary key,
  user_id     uuid not null default auth.uid(),
  payload     jsonb not null default '{}'::jsonb,
  created_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);

alter table public.courses
  add column if not exists slug     text generated always as (payload->>'slug') stored,
  add column if not exists title    text generated always as (payload->>'title') stored,
  add column if not exists level    text generated always as (payload->>'level') stored,
  add column if not exists order_no int  generated always as ((payload->>'order')::int) stored;

create unique index if not exists courses_user_slug_uidx on public.courses (user_id, slug);

-- ---------------------------------------------------------------------------
-- lessons · 单节课（讲解 + 要点 + 练习 + 做题进度）
-- ---------------------------------------------------------------------------
create table if not exists public.lessons (
  id          text primary key,
  user_id     uuid not null default auth.uid(),
  payload     jsonb not null default '{}'::jsonb,
  created_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);

alter table public.lessons
  add column if not exists course_id text    generated always as (payload->>'course_id') stored,
  add column if not exists unit_no   int     generated always as ((payload->>'unit_no')::int) stored,
  add column if not exists title     text    generated always as (payload->>'title') stored,
  add column if not exists kind      text    generated always as (payload->>'kind') stored,
  add column if not exists done      boolean generated always as ((payload->>'done')::boolean) stored,
  add column if not exists score     numeric generated always as ((payload->>'score')::numeric) stored;

create index if not exists lessons_user_course_idx on public.lessons (user_id, course_id, unit_no);

-- ---------------------------------------------------------------------------
-- words · 补充分类字段（雅思四类用途 + 词库来源）索引，便于按分类同步与统计
-- ---------------------------------------------------------------------------
alter table public.words
  add column if not exists category text generated always as (payload->>'category') stored,
  add column if not exists book     text generated always as (payload->>'book') stored;

create index if not exists words_user_book_cat_idx on public.words (user_id, book, category);

-- ---------------------------------------------------------------------------
-- RLS：每张新表四条策略，只能读写自己的数据
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array['courses', 'lessons'];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%s_select_own" on public.%I;', t, t);
    execute format('drop policy if exists "%s_insert_own" on public.%I;', t, t);
    execute format('drop policy if exists "%s_update_own" on public.%I;', t, t);
    execute format('drop policy if exists "%s_delete_own" on public.%I;', t, t);
    execute format('create policy "%s_select_own" on public.%I for select using (auth.uid() = user_id);', t, t);
    execute format('create policy "%s_insert_own" on public.%I for insert with check (auth.uid() = user_id);', t, t);
    execute format('create policy "%s_update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t, t);
    execute format('create policy "%s_delete_own" on public.%I for delete using (auth.uid() = user_id);', t, t);
    execute format('drop trigger if exists trg_%s_touch on public.%I;', t, t);
    execute format('create trigger trg_%s_touch before update on public.%I for each row execute function public.touch_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 便捷视图：课程进度一眼看清
-- ---------------------------------------------------------------------------
create or replace view public.v_ielts_progress as
  select c.user_id,
         c.payload->>'slug'  as course,
         c.payload->>'title' as course_title,
         count(l.id)                                             as lessons_total,
         count(l.id) filter (where (l.payload->>'done')::boolean) as lessons_done,
         round(avg((l.payload->>'score')::numeric)
               filter (where (l.payload->>'done')::boolean), 0)   as avg_score
  from public.courses c
  left join public.lessons l
    on l.payload->>'course_id' = c.id and l.user_id = c.user_id
  group by c.user_id, c.payload->>'slug', c.payload->>'title'
  order by course;

-- ---------------------------------------------------------------------------
-- 迁移记录
-- ---------------------------------------------------------------------------
create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);
insert into public.schema_migrations (version) values ('0002_ielts')
on conflict (version) do nothing;
