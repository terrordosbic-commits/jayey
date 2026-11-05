-- Run this script in Supabase Dashboard > SQL Editor.
-- The orders table is server-only. Never expose the service role key in the browser.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  external_reference uuid not null unique,
  payment_id text unique,
  fulfillment_type text not null default 'pickup',
  customer_name text,
  customer_phone text,
  delivery_street text,
  delivery_number text,
  delivery_neighborhood text,
  delivery_zone text,
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  customer_email text not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  amount_cents integer not null check (amount_cents > 0),
  payment_method_id text,
  status text not null default 'creating',
  status_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_street text,
  add column if not exists delivery_number text,
  add column if not exists delivery_neighborhood text,
  add column if not exists fulfillment_type text not null default 'pickup',
  add column if not exists delivery_zone text,
  add column if not exists delivery_fee_cents integer not null default 0;

alter table public.orders
  alter column customer_email drop not null;

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_status_idx
  on public.orders (status);

alter table public.orders enable row level security;

revoke all on table public.orders from anon, authenticated;
grant all on table public.orders to service_role;
