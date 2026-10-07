-- ============================================================================
-- 月月的工作台 · Supabase 迁移 0001_init
-- 用法：Supabase Dashboard → SQL Editor → 粘贴执行；或 `supabase db push`
-- 特性：所有表含 user_id + RLS 行级安全（只能读写自己的数据）
--       表结构与前端 IndexedDB 完全一致，可在本地/云端之间无缝导入导出
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 通用：updated_at 触发器
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 建表宏（保持所有表结构一致：id / user_id / created_at / updated_at + 业务列）
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'todos','plants','plant_logs','inspirations','quotes','words','word_logs',
    'accounts','transactions','fixed_items','shopping','wishes','gold_prices',
    'couple','couple_logs','memos','reads','reminders','coins','achievements','settings'
  ];
begin
  foreach t in array tables loop
    execute format($f$
      create table if not exists public.%I (
        id          text primary key,
        user_id     uuid not null default auth.uid(),
        payload     jsonb not null default '{}'::jsonb,
        created_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
        updated_at  bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
      );
    $f$, t);
  end loop;
end $$;

-- 说明：业务字段以 jsonb payload 承载，兼顾「前端字段可自由演进」与「迁移不影响已存数据」。
-- 同时对高频查询字段建立生成列 + 索引，保证查询性能并与前端字段名一一对应。

-- ---------------------------------------------------------------------------
-- 生成列 + 索引（与 IndexedDB 字段同名，便于直接读写与过滤）
-- ---------------------------------------------------------------------------

-- todos
alter table public.todos
  add column if not exists date        text generated always as (payload->>'date') stored,
  add column if not exists title       text generated always as (payload->>'title') stored,
  add column if not exists done        boolean generated always as ((payload->>'done')::boolean) stored,
  add column if not exists source      text generated always as (payload->>'source') stored;
create index if not exists todos_user_date_idx on public.todos (user_id, date);

-- plants
alter table public.plants
  add column if not exists name        text generated always as (payload->>'name') stored,
  add column if not exists category    text generated always as (payload->>'category') stored,
  add column if not exists planted_at  text generated always as (payload->>'planted_at') stored;

-- plant_logs
alter table public.plant_logs
  add column if not exists plant_id    text generated always as (payload->>'plant_id') stored,
  add column if not exists date        text generated always as (payload->>'date') stored;
create index if not exists plant_logs_plant_idx on public.plant_logs (user_id, plant_id, date);

-- inspirations / quotes
alter table public.inspirations
  add column if not exists kind        text generated always as (payload->>'kind') stored,
  add column if not exists title       text generated always as (payload->>'title') stored;
alter table public.quotes
  add column if not exists text_body   text generated always as (payload->>'text') stored;

-- words / word_logs
alter table public.words
  add column if not exists word        text generated always as (payload->>'word') stored,
  add column if not exists date        text generated always as (payload->>'date') stored;
alter table public.word_logs
  add column if not exists word_id     text generated always as (payload->>'word_id') stored,
  add column if not exists date        text generated always as (payload->>'date') stored;

-- accounts / transactions
alter table public.accounts
  add column if not exists kind        text generated always as (payload->>'kind') stored,
  add column if not exists month       text generated always as (payload->>'month') stored;
alter table public.transactions
  add column if not exists kind        text generated always as (payload->>'kind') stored,
  add column if not exists amount      numeric generated always as ((payload->>'amount')::numeric) stored,
  add column if not exists date        text generated always as (payload->>'date') stored,
  add column if not exists category    text generated always as (payload->>'category') stored;
create index if not exists tx_user_date_idx on public.transactions (user_id, date);
create index if not exists tx_kind_idx on public.transactions (user_id, kind, date);

-- fixed_items / shopping / wishes
alter table public.fixed_items
  add column if not exists name        text generated always as (payload->>'name') stored,
  add column if not exists day         int  generated always as ((payload->>'day')::int) stored;
alter table public.shopping
  add column if not exists status      text generated always as (payload->>'status') stored,
  add column if not exists date        text generated always as (payload->>'date') stored;
alter table public.wishes
  add column if not exists tier        int  generated always as ((payload->>'tier')::int) stored,
  add column if not exists status      text generated always as (payload->>'status') stored;

-- gold_prices
alter table public.gold_prices
  add column if not exists date        text generated always as (payload->>'date') stored;
create unique index if not exists gold_prices_user_date_uidx on public.gold_prices (user_id, date);

-- couple_logs / memos / reads
alter table public.couple_logs
  add column if not exists date        text generated always as (payload->>'date') stored;
alter table public.memos
  add column if not exists date        text generated always as (payload->>'date') stored;
alter table public.reads
  add column if not exists date        text generated always as (payload->>'date') stored,
  add column if not exists inspire_id  text generated always as (payload->>'inspire_id') stored;

-- reminders
alter table public.reminders
  add column if not exists title       text generated always as (payload->>'title') stored,
  add column if not exists type        text generated always as (payload->>'type') stored,
  add column if not exists next_due    text generated always as (payload->>'next_due') stored,
  add column if not exists time        text generated always as (payload->>'time') stored,
  add column if not exists advance     int  generated always as ((payload->>'advance')::int) stored;
create index if not exists reminders_user_due_idx on public.reminders (user_id, next_due);

-- coins / achievements
alter table public.coins
  add column if not exists date        text generated always as (payload->>'date') stored,
  add column if not exists kind        text generated always as (payload->>'kind') stored,
  add column if not exists amount      numeric generated always as ((payload->>'amount')::numeric) stored;
create index if not exists coins_user_date_idx on public.coins (user_id, date);
alter table public.achievements
  add column if not exists key         text generated always as (payload->>'key') stored;
create unique index if not exists achievements_user_key_uidx on public.achievements (user_id, key);

-- settings
alter table public.settings
  add column if not exists key         text generated always as (payload->>'key') stored;
create unique index if not exists settings_user_key_uidx on public.settings (user_id, key);

-- ---------------------------------------------------------------------------
-- RLS：开启行级安全，每人只能读写自己的数据
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'todos','plants','plant_logs','inspirations','quotes','words','word_logs',
    'accounts','transactions','fixed_items','shopping','wishes','gold_prices',
    'couple','couple_logs','memos','reads','reminders','coins','achievements','settings'
  ];
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
-- 推送订阅表（服务端用 Service Role 写入，客户端只读自己的）
-- ---------------------------------------------------------------------------
create table if not exists public.push_subs (
  id           text primary key,
  user_id      uuid null,
  endpoint     text not null unique,
  keys         jsonb not null default '{}'::jsonb,
  ua           text default '',
  timezone     text default 'Asia/Shanghai',
  created_at   bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint,
  updated_at   bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);
alter table public.push_subs enable row level security;
drop policy if exists "push_subs_select_own" on public.push_subs;
create policy "push_subs_select_own" on public.push_subs for select using (auth.uid() = user_id);
drop policy if exists "push_subs_insert_anon" on public.push_subs;
create policy "push_subs_insert_anon" on public.push_subs for insert
  with check (user_id is null or auth.uid() = user_id);
drop trigger if exists trg_push_subs_touch on public.push_subs;
create trigger trg_push_subs_touch before update on public.push_subs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Storage：图片桶（存上传照片，路径 <user_id>/<yyyy-mm>/xxx.webp）
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workbench', 'workbench', true, 1048576, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 1048576;

drop policy if exists "workbench_read" on storage.objects;
create policy "workbench_read" on storage.objects for select
  using (bucket_id = 'workbench');

drop policy if exists "workbench_insert_own" on storage.objects;
create policy "workbench_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'workbench' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "workbench_update_own" on storage.objects;
create policy "workbench_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'workbench' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "workbench_delete_own" on storage.objects;
create policy "workbench_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'workbench' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 便捷视图：把 payload 摊平，方便在 Dashboard 里直接看
-- ---------------------------------------------------------------------------
create or replace view public.v_todos as
  select id, user_id, payload->>'title' as title, payload->>'date' as date,
         payload->>'time' as time, (payload->>'done')::boolean as done, created_at
  from public.todos order by (payload->>'date') desc;

create or replace view public.v_transactions as
  select id, user_id, payload->>'kind' as kind, payload->>'category' as category,
         (payload->>'amount')::numeric as amount, payload->>'date' as date, created_at
  from public.transactions order by (payload->>'date') desc;

-- ---------------------------------------------------------------------------
-- 迁移记录
-- ---------------------------------------------------------------------------
create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);
insert into public.schema_migrations (version) values ('0001_init')
on conflict (version) do nothing;
