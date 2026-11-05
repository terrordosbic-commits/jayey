create table if not exists public.inventory (
  id text primary key,
  stock integer,
  flavors text[] not null default '{}',
  flavor_stock jsonb not null default '{}'::jsonb,
  constraint inventory_stock_nonnegative check (stock is null or stock >= 0)
);

alter table public.inventory
  add column if not exists flavor_stock jsonb not null default '{}'::jsonb;

create table if not exists public.manual_sales (
  id uuid primary key default gen_random_uuid(),
  amount_cents integer not null check (amount_cents > 0),
  note text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.inventory enable row level security;
alter table public.inventory_admins enable row level security;
alter table public.manual_sales enable row level security;

drop policy if exists inventory_admins_read_self on public.inventory_admins;
create policy inventory_admins_read_self
  on public.inventory_admins for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists inventory_public_read on public.inventory;
create policy inventory_public_read
  on public.inventory for select
  to anon, authenticated
  using (true);

drop policy if exists inventory_admin_insert on public.inventory;
create policy inventory_admin_insert
  on public.inventory for insert
  to authenticated
  with check (
    exists (
      select 1 from public.inventory_admins
      where user_id = auth.uid()
    )
  );

drop policy if exists inventory_admin_update on public.inventory;
create policy inventory_admin_update
  on public.inventory for update
  to authenticated
  using (
    exists (
      select 1 from public.inventory_admins
      where user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.inventory_admins
      where user_id = auth.uid()
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.inventory to anon, authenticated;
grant insert, update on public.inventory to authenticated;
grant select, insert, update on public.inventory to service_role;
grant select on public.inventory_admins to authenticated;
revoke all on public.manual_sales from anon, authenticated;
grant select, insert on public.manual_sales to service_role;

insert into public.inventory (id, stock, flavors)
values
  ('zomo', null, '{}'),
  ('ziggy', null, '{}'),
  ('nay', null, '{}'),
  ('bass', null, '{}'),
  ('alu', null, '{}')
on conflict (id) do nothing;

-- Create the administrator in Supabase Auth, then run this with that user's UUID:
-- insert into public.inventory_admins (user_id) values ('UUID_DO_ADMIN');
