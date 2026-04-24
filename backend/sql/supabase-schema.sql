-- Supabase / PostgreSQL schema for the household ledger application.
create extension if not exists pgcrypto;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null unique,
  type varchar(10) not null default 'expense' check (type in ('income', 'expense', 'both')),
  color varchar(20) not null default '#6366f1',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null default current_date,
  type varchar(10) not null check (type in ('income', 'expense')),
  amount bigint not null check (amount >= 0),
  category_id uuid references categories(id) on delete set null,
  note text,
  payment_method varchar(50) not null default '현금',
  source_type varchar(20) not null default 'manual' check (source_type in ('manual', 'recurring', 'fixed_expense', 'restore')),
  source_id uuid,
  auto_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, transaction_date)
);

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  type varchar(10) not null default 'expense' check (type in ('income', 'expense')),
  amount bigint not null check (amount >= 0),
  category_id uuid references categories(id) on delete set null,
  note text,
  payment_method varchar(50) not null default '현금',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  type varchar(10) not null default 'expense' check (type in ('income', 'expense')),
  amount bigint not null check (amount >= 0),
  category_id uuid references categories(id) on delete set null,
  note text,
  payment_method varchar(50) not null default '현금',
  frequency varchar(20) not null check (frequency in ('daily', 'weekly', 'monthly')),
  interval_count integer not null default 1 check (interval_count >= 1),
  start_date date not null,
  weekday integer check (weekday between 0 and 6),
  day_of_month integer check (day_of_month between 1 and 31),
  next_run_date date not null,
  last_generated_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  amount bigint not null check (amount >= 0),
  category_id uuid references categories(id) on delete set null,
  note text,
  payment_method varchar(50) not null default '자동이체',
  day_of_month integer not null check (day_of_month between 1 and 31),
  start_date date not null default current_date,
  next_run_date date not null,
  last_generated_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  category_id uuid references categories(id) on delete cascade,
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month_start, category_id)
);

create table if not exists app_settings (
  id boolean primary key default true check (id = true),
  dark_mode boolean not null default false,
  pin_enabled boolean not null default false,
  pin_hash text,
  currency varchar(10) not null default 'KRW',
  updated_at timestamptz not null default now()
);

create index if not exists idx_transactions_date on transactions(transaction_date desc);
create index if not exists idx_transactions_category on transactions(category_id);
create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_transactions_payment on transactions(payment_method);
create index if not exists idx_transactions_note on transactions using gin (to_tsvector('simple', coalesce(note, '')));
create index if not exists idx_recurring_next_run_date on recurring_transactions(next_run_date) where is_active = true;
create index if not exists idx_fixed_expenses_next_run_date on fixed_expenses(next_run_date) where is_active = true;
create index if not exists idx_budgets_month on budgets(month_start);

insert into app_settings (id) values (true)
on conflict (id) do nothing;

insert into categories (name, type, color, is_default)
values
  ('미분류', 'both', '#64748b', true),
  ('식비', 'expense', '#f97316', true),
  ('교통', 'expense', '#06b6d4', true),
  ('주거', 'expense', '#8b5cf6', true),
  ('쇼핑', 'expense', '#ec4899', true),
  ('취미', 'expense', '#14b8a6', true),
  ('고정지출', 'expense', '#ef4444', true),
  ('적금', 'expense', '#10b981', true),
  ('주식 투자', 'expense', '#6366f1', true),
  ('주식 실현손익', 'both', '#f59e0b', true),
  ('수입', 'income', '#22c55e', true)
on conflict (name) do nothing;
