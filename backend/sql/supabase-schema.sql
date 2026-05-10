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
  transaction_date date not null,
  type varchar(10) not null check (type in ('income', 'expense', 'transfer')),
  amount numeric(15,2) not null check (amount >= 0),
  category_id uuid references categories(id) on delete set null,
  asset_account_id uuid references asset_accounts(id) on delete set null,
  transfer_to_asset_account_id uuid references asset_accounts(id) on delete set null,
  cash_status varchar(30) not null default 'none',
  cash_unsettled_amount bigint not null default 0,
  note text,
  payment_method varchar(50) not null default '현금',
  source_type varchar(20) not null default 'manual' check (source_type in ('manual', 'recurring', 'fixed_expense', 'restore')),
  source_id uuid,
  auto_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id, transaction_date)
);

create index if not exists idx_transactions_date
  on transactions(transaction_date desc);

create index if not exists idx_transactions_type
  on transactions(type);

create index if not exists idx_transactions_category
  on transactions(category_id);

create index if not exists idx_transactions_asset
  on transactions(asset_account_id);

create index if not exists idx_transactions_transfer_asset
  on transactions(transfer_to_asset_account_id);

create table if not exists transaction_histories (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid,
  action varchar(20) not null check (action in ('update', 'delete')),
  before_data jsonb not null,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_transaction_histories_created_at
  on transaction_histories(created_at desc);

create index if not exists idx_transaction_histories_transaction_id
  on transaction_histories(transaction_id);

create table if not exists upload_logs (
  id uuid primary key default gen_random_uuid(),
  upload_type varchar(30) not null default 'transaction_excel',
  file_name varchar(255),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  excluded_rows integer not null default 0,
  transfer_rows integer not null default 0,
  status varchar(20) not null default 'success' check (status in ('success', 'fail')),
  error_message varchar(1000),
  created_at timestamptz not null default now()
);

alter table upload_logs
drop constraint if exists upload_logs_type_check;

alter table upload_logs
add constraint upload_logs_type_check
check (upload_type in ('transaction_excel'));

alter table upload_logs
drop constraint if exists upload_logs_rows_check;

alter table upload_logs
add constraint upload_logs_rows_check
check (
  total_rows >= 0
  and imported_rows >= 0
  and excluded_rows >= 0
  and transfer_rows >= 0
);

alter table upload_logs
drop constraint if exists upload_logs_total_check;

alter table upload_logs
add constraint upload_logs_total_check
check (
  imported_rows + excluded_rows <= total_rows
);

create index if not exists idx_upload_logs_created_at on upload_logs(created_at desc);

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

create index if not exists idx_recurring_transactions_next_run_date
  on recurring_transactions(next_run_date);

create index if not exists idx_recurring_transactions_is_active
  on recurring_transactions(is_active);

create index if not exists idx_recurring_transactions_type
  on recurring_transactions(type);

create table if not exists fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  type varchar(20) not null default 'expense' check (type in ('income', 'expense', 'transfer')),
  amount bigint not null check (amount >= 0),
  category_id uuid references categories(id) on delete set null,
  from_asset_account_id uuid references asset_accounts(id) on delete set null,
  to_asset_account_id uuid references asset_accounts(id) on delete set null,
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

create index if not exists idx_fixed_expenses_next_run_date
  on fixed_expenses(next_run_date);

create index if not exists idx_fixed_expenses_is_active
  on fixed_expenses(is_active);

create index if not exists idx_fixed_expenses_type
  on fixed_expenses(type);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  category_id uuid references categories(id) on delete cascade,
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month_start, category_id)
);

create index if not exists idx_budgets_month_start
  on budgets(month_start);

create index if not exists idx_budgets_category_id
  on budgets(category_id);

create table if not exists asset_accounts (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  asset_type varchar(50) not null default '입출금',
  balance bigint not null default 0,
  initial_balance bigint not null default 0,
  display_order integer not null default 0,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  id boolean primary key default true check (id = true),
  dark_mode boolean not null default false,
  theme_mode varchar(30) not null default 'light',
  pin_enabled boolean not null default false,
  pin_hash text,
  currency varchar(10) not null default 'KRW',
  ledger_name varchar(80) not null default '가계부',
  target_asset_amount bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  total_asset_amount bigint not null default 0,
  cash_amount bigint not null default 0,
  bank_amount bigint not null default 0,
  saving_amount bigint not null default 0,
  investment_amount bigint not null default 0,
  card_amount bigint not null default 0,
  etc_amount bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_asset_snapshots_snapshot_date
  on asset_snapshots(snapshot_date desc);

create index if not exists idx_transactions_date on transactions(transaction_date desc);
create index if not exists idx_transaction_histories_transaction_id on transaction_histories(transaction_id);
create index if not exists idx_transaction_histories_created_at on transaction_histories(created_at desc);
create index if not exists idx_transactions_category on transactions(category_id);
create index if not exists idx_transactions_type on transactions(type);
create index if not exists idx_transactions_payment on transactions(payment_method);
create index if not exists idx_transactions_note on transactions using gin (to_tsvector('simple', coalesce(note, '')));
create index if not exists idx_recurring_next_run_date on recurring_transactions(next_run_date) where is_active = true;
create index if not exists idx_fixed_expenses_next_run_date on fixed_expenses(next_run_date) where is_active = true;
create index if not exists idx_budgets_month on budgets(month_start);
create index if not exists idx_asset_accounts_order on asset_accounts(display_order, created_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_name_unique'
  ) then
    alter table categories
    add constraint categories_name_unique unique (name);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'app_settings_id_unique'
  ) then
    alter table app_settings
    add constraint app_settings_id_unique unique (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_source_unique'
  ) then
    alter table transactions
    add constraint transactions_source_unique unique (source_type, source_id, transaction_date);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'budgets_month_category_unique'
  ) then
    alter table budgets
    add constraint budgets_month_category_unique unique (month_start, category_id);
  end if;
end $$;

alter table app_settings
add column if not exists theme_mode varchar(30) not null default 'light';

alter table app_settings
add column if not exists ledger_name varchar(80) not null default '가계부';

alter table asset_accounts
add column if not exists initial_balance bigint not null default 0;

update asset_accounts
set initial_balance = balance
where initial_balance = 0;

alter table transactions
add column if not exists asset_account_id uuid references asset_accounts(id) on delete set null;

alter table transactions
add column if not exists transfer_to_asset_account_id uuid references asset_accounts(id) on delete set null;

alter table transactions
add column if not exists cash_status varchar(30) not null default 'none';

alter table transactions
add column if not exists cash_unsettled_amount bigint not null default 0;

create index if not exists idx_transactions_asset on transactions(asset_account_id);

alter table transactions
drop constraint if exists transactions_type_check;

alter table transactions
add constraint transactions_type_check
check (type in ('income', 'expense', 'transfer'));

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

alter table fixed_expenses
add column if not exists type varchar(20) not null default 'expense';

alter table fixed_expenses
drop constraint if exists fixed_expenses_type_check;

alter table fixed_expenses
add constraint fixed_expenses_type_check
check (type in ('income', 'expense', 'transfer'));

alter table fixed_expenses
add column if not exists from_asset_account_id uuid references asset_accounts(id) on delete set null;

alter table fixed_expenses
add column if not exists to_asset_account_id uuid references asset_accounts(id) on delete set null;

alter table app_settings
add column if not exists target_asset_amount bigint not null default 0;

alter table asset_snapshots
add column if not exists total_asset_amount bigint not null default 0;

alter table asset_snapshots
add column if not exists cash_amount bigint not null default 0;

alter table asset_snapshots
add column if not exists bank_amount bigint not null default 0;

alter table asset_snapshots
add column if not exists saving_amount bigint not null default 0;

alter table asset_snapshots
add column if not exists investment_amount bigint not null default 0;

alter table asset_snapshots
add column if not exists card_amount bigint not null default 0;

alter table asset_snapshots
add column if not exists etc_amount bigint not null default 0;

alter table upload_logs
alter column file_name type varchar(255);

alter table upload_logs
alter column error_message type varchar(1000);
