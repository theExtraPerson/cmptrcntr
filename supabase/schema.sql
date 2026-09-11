-- VivianFi schema
-- Run this in the Supabase SQL editor after creating a project.
-- Also disable email confirmation: Authentication → Providers → Email → Confirm email OFF
--
-- After you register the first admin account:
--   insert into public.user_roles (user_id, role)
--   select id, 'admin' from public.profiles where username = 'YOUR_USERNAME';

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  phone text not null,
  referral_code text unique not null,
  referred_by uuid references public.profiles(id),
  balance numeric not null default 0,
  total_deposits numeric not null default 0,
  total_income numeric not null default 0,
  total_withdrawals numeric not null default 0,
  referral_income numeric not null default 0,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin')),
  unique (user_id, role)
);

create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_products (
  id uuid primary key default gen_random_uuid(),
  name text,
  price numeric not null,
  daily_income numeric not null,
  validity_days integer not null default 4,
  thumbnail_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  payment_method text not null,
  transaction_id text not null,
  sender_name text,
  sender_phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  fee numeric not null,
  net_amount numeric not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.investment_products(id),
  amount numeric not null,
  daily_income numeric not null,
  payouts_claimed integer not null default 0,
  days_remaining integer not null default 4,
  next_payout_at timestamptz not null,
  last_claimed_at timestamptz,
  is_active boolean not null default true,
  capital_returned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.income_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null,
  type text not null,
  source_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.success_stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  image_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investment_products alter column validity_days set default 4;
alter table public.user_investments alter column days_remaining set default 4;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.investment_products enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.user_investments enable row level security;
alter table public.income_history enable row level security;
alter table public.success_stories enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "profiles readable" on public.profiles;
drop policy if exists "profiles insert own" on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "profiles update own phone" on public.profiles;
drop policy if exists "roles readable" on public.user_roles;
drop policy if exists "settings readable" on public.platform_settings;
drop policy if exists "products readable" on public.investment_products;
drop policy if exists "own deposits" on public.deposits;
drop policy if exists "insert own deposits" on public.deposits;
drop policy if exists "admin deposits" on public.deposits;
drop policy if exists "own withdrawals" on public.withdrawals;
drop policy if exists "admin withdrawals" on public.withdrawals;
drop policy if exists "own investments" on public.user_investments;
drop policy if exists "admin investments" on public.user_investments;
drop policy if exists "own income" on public.income_history;
drop policy if exists "admin income" on public.income_history;
drop policy if exists "stories public" on public.success_stories;
drop policy if exists "admin stories" on public.success_stories;

create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles update own phone" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.protect_profile_money()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role')
     or coalesce(auth.role(), '') = 'service_role' then
    return NEW;
  end if;
  NEW.balance := OLD.balance;
  NEW.total_deposits := OLD.total_deposits;
  NEW.total_income := OLD.total_income;
  NEW.total_withdrawals := OLD.total_withdrawals;
  NEW.referral_income := OLD.referral_income;
  NEW.is_banned := OLD.is_banned;
  NEW.referral_code := OLD.referral_code;
  NEW.referred_by := OLD.referred_by;
  NEW.username := OLD.username;
  return NEW;
end;
$$;

drop trigger if exists protect_profile_money on public.profiles;
create trigger protect_profile_money
  before update on public.profiles
  for each row execute procedure public.protect_profile_money();

create policy "roles readable" on public.user_roles for select using (true);
create policy "settings readable" on public.platform_settings for select using (true);
create policy "products readable" on public.investment_products for select using (true);

create policy "own deposits" on public.deposits for select using (auth.uid() = user_id or public.is_admin());
create policy "own withdrawals" on public.withdrawals for select using (auth.uid() = user_id or public.is_admin());
create policy "own investments" on public.user_investments for select using (auth.uid() = user_id or public.is_admin());
create policy "own income" on public.income_history for select using (auth.uid() = user_id or public.is_admin());
create policy "stories public" on public.success_stories for select using (is_published = true or public.is_admin());

create or replace function public.approve_deposit(p_deposit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
  referrer uuid;
  commission numeric;
  pct numeric;
  activated boolean;
begin
  select * into d from public.deposits where id = p_deposit_id for update;
  if not found then
    raise exception 'Deposit not found';
  end if;
  if d.status <> 'pending' then
    raise exception 'Deposit is not pending';
  end if;

  update public.deposits
    set status = 'approved', approved_at = now()
    where id = p_deposit_id;

  update public.profiles
    set balance = balance + d.amount,
        total_deposits = total_deposits + d.amount
    where id = d.user_id;

  insert into public.income_history (user_id, amount, type, source_id)
  values (d.user_id, d.amount, 'deposit', d.id);

  -- 5% Direct Affiliate Bonus after the referred user has activated a quantitative robot
  select exists(select 1 from public.user_investments where user_id = d.user_id) into activated;
  select referred_by into referrer from public.profiles where id = d.user_id;
  select coalesce(nullif(value, '')::numeric, 5) into pct
    from public.platform_settings where key = 'referral_percent';
  if pct is null then pct := 5; end if;
  if activated and referrer is not null then
    commission := round(d.amount * pct / 100, 0);
    if commission > 0 then
      update public.profiles
        set balance = balance + commission,
            total_income = total_income + commission,
            referral_income = referral_income + commission
        where id = referrer;
      insert into public.income_history (user_id, amount, type, source_id)
      values (referrer, commission, 'referral', d.id);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'commission', coalesce(commission, 0));
end;
$$;

create or replace function public.reject_deposit(p_deposit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
begin
  select * into d from public.deposits where id = p_deposit_id for update;
  if not found then raise exception 'Deposit not found'; end if;
  if d.status <> 'pending' then raise exception 'Deposit is not pending'; end if;
  update public.deposits set status = 'rejected' where id = p_deposit_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.request_withdraw(
  p_user_id uuid,
  p_amount numeric,
  p_fee numeric,
  p_net numeric,
  p_phone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  wid uuid;
begin
  select balance into bal from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if p_amount <= 0 then raise exception 'Invalid amount'; end if;
  if bal < p_amount then raise exception 'Insufficient balance'; end if;

  update public.profiles
    set balance = balance - p_amount,
        total_withdrawals = total_withdrawals + p_amount
    where id = p_user_id;

  insert into public.withdrawals (user_id, amount, fee, net_amount, phone, status)
  values (p_user_id, p_amount, p_fee, p_net, p_phone, 'pending')
  returning id into wid;

  return wid;
end;
$$;

create or replace function public.reject_withdraw(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.withdrawals%rowtype;
begin
  select * into w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if w.status <> 'pending' then raise exception 'Withdrawal is not pending'; end if;

  update public.withdrawals set status = 'rejected' where id = p_withdrawal_id;
  update public.profiles
    set balance = balance + w.amount,
        total_withdrawals = greatest(total_withdrawals - w.amount, 0)
    where id = w.user_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.approve_withdraw(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.withdrawals%rowtype;
begin
  select * into w from public.withdrawals where id = p_withdrawal_id for update;
  if not found then raise exception 'Withdrawal not found'; end if;
  if w.status <> 'pending' then raise exception 'Withdrawal is not pending'; end if;
  update public.withdrawals set status = 'approved' where id = p_withdrawal_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.buy_product(p_user_id uuid, p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.investment_products%rowtype;
  bal numeric;
  iid uuid;
begin
  select * into p from public.investment_products where id = p_product_id and is_active = true;
  if not found then raise exception 'Product not available'; end if;

  select balance into bal from public.profiles where id = p_user_id for update;
  if bal < p.price then raise exception 'Insufficient balance'; end if;

  update public.profiles set balance = balance - p.price where id = p_user_id;

  insert into public.user_investments (
    user_id, product_id, amount, daily_income, payouts_claimed, days_remaining,
    next_payout_at, is_active, capital_returned
  ) values (
    p_user_id, p.id, p.price, p.daily_income, 0, p.validity_days,
    now() + interval '24 hours', true, false
  ) returning id into iid;

  return iid;
end;
$$;

create or replace function public.process_user_payouts(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.user_investments%rowtype;
  credited numeric := 0;
  capital numeric := 0;
  n int := 0;
begin
  loop
    select * into inv
    from public.user_investments
    where user_id = p_user_id and is_active = true and next_payout_at <= now()
    order by next_payout_at
    limit 1
    for update skip locked;
    exit when not found;

    update public.profiles
      set balance = balance + inv.daily_income,
          total_income = total_income + inv.daily_income
      where id = p_user_id;

    insert into public.income_history (user_id, amount, type, source_id)
    values (p_user_id, inv.daily_income, 'daily', inv.id);

    credited := credited + inv.daily_income;
    n := n + 1;

    update public.user_investments
      set payouts_claimed = payouts_claimed + 1,
          days_remaining = greatest(days_remaining - 1, 0),
          last_claimed_at = now(),
          next_payout_at = next_payout_at + interval '24 hours'
      where id = inv.id;

    if (select days_remaining from public.user_investments where id = inv.id) = 0 then
      update public.profiles
        set balance = balance + inv.amount
        where id = p_user_id;
      insert into public.income_history (user_id, amount, type, source_id)
      values (p_user_id, inv.amount, 'capital', inv.id);
      update public.user_investments
        set is_active = false, capital_returned = true
        where id = inv.id;
      capital := capital + inv.amount;
    end if;
  end loop;

  return jsonb_build_object('payouts', n, 'credited', credited, 'capital_returned', capital);
end;
$$;

create or replace function public.adjust_user_balance(p_user_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_bal numeric;
begin
  update public.profiles
    set balance = greatest(balance + p_delta, 0)
    where id = p_user_id
    returning balance into new_bal;
  if not found then raise exception 'User not found'; end if;
  return new_bal;
end;
$$;

revoke all on function public.approve_deposit(uuid) from public, anon, authenticated;
revoke all on function public.reject_deposit(uuid) from public, anon, authenticated;
revoke all on function public.request_withdraw(uuid, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.reject_withdraw(uuid) from public, anon, authenticated;
revoke all on function public.approve_withdraw(uuid) from public, anon, authenticated;
revoke all on function public.buy_product(uuid, uuid) from public, anon, authenticated;
revoke all on function public.process_user_payouts(uuid) from public, anon, authenticated;
revoke all on function public.adjust_user_balance(uuid, numeric) from public, anon, authenticated;

grant execute on function public.approve_deposit(uuid) to service_role;
grant execute on function public.reject_deposit(uuid) to service_role;
grant execute on function public.request_withdraw(uuid, numeric, numeric, numeric, text) to service_role;
grant execute on function public.reject_withdraw(uuid) to service_role;
grant execute on function public.approve_withdraw(uuid) to service_role;
grant execute on function public.buy_product(uuid, uuid) to service_role;
grant execute on function public.process_user_payouts(uuid) to service_role;
grant execute on function public.adjust_user_balance(uuid, numeric) to service_role;

insert into public.platform_settings (key, value) values
  ('welcome_popup_enabled', 'true'),
  ('welcome_popup_message', 'Welcome to VivianFi. Deposit, activate a quantitative machine, and start earning daily returns.'),
  ('mtn_number', '0792451776'),
  ('mtn_name', 'Simon Okellet'),
  ('airtel_number', '0707626840'),
  ('airtel_name', 'Lydia Nakisige'),
  ('min_deposit', '5000'),
  ('max_deposit', '5000000'),
  ('min_withdrawal', '2000'),
  ('max_withdrawal', '5000000'),
  ('withdraw_fee_percent', '20'),
  ('withdraw_start_time', '09:00'),
  ('withdraw_end_time', '23:00'),
  ('telegram_support', 'https://t.me/+256704057716'),
  ('whatsapp_group', 'https://chat.whatsapp.com/BaxNRCmfLKO9OJIPpRDbbA'),
  ('force_refresh_timestamp', '0'),
  ('referral_percent', '5')
on conflict (key) do nothing;

insert into public.investment_products (name, price, daily_income, validity_days, thumbnail_url, is_active)
select * from (values
  ('VF5000', 5000::numeric, 1000::numeric, 4, '/hero_image.jpg', true),
  ('VF10000', 10000::numeric, 2100::numeric, 4, '/hero_image.jpg', true),
  ('VF20000', 20000::numeric, 4400::numeric, 4, '/hero_image.jpg', true),
  ('VF50000', 50000::numeric, 11500::numeric, 4, '/hero_image.jpg', true),
  ('VF200000', 200000::numeric, 48000::numeric, 4, '/hero_image.jpg', true),
  ('VF500000', 500000::numeric, 125000::numeric, 4, '/hero_image.jpg', true),
  ('VF5000000', 5000000::numeric, 1300000::numeric, 4, '/hero_image.jpg', true)
) as v(name, price, daily_income, validity_days, thumbnail_url, is_active)
where not exists (select 1 from public.investment_products);

-- Keep catalogs in sync if this file is re-run on an existing project
update public.investment_products set name = 'VF5000', daily_income = 1000, validity_days = 4, thumbnail_url = '/hero_image.jpg', is_active = true where price = 5000;
update public.investment_products set name = 'VF10000', daily_income = 2100, validity_days = 4, thumbnail_url = '/hero_image.jpg', is_active = true where price = 10000;
update public.investment_products set name = 'VF20000', daily_income = 4400, validity_days = 4, thumbnail_url = '/hero_image.jpg', is_active = true where price = 20000;
update public.investment_products set name = 'VF50000', daily_income = 11500, validity_days = 4, thumbnail_url = '/hero_image.jpg', is_active = true where price = 50000;
update public.investment_products set name = 'VF200000', daily_income = 48000, validity_days = 4, thumbnail_url = '/hero_image.jpg', is_active = true where price = 200000;
update public.investment_products set name = 'VF500000', daily_income = 125000, validity_days = 4, thumbnail_url = '/hero_image.jpg', is_active = true where price = 500000;
update public.investment_products set name = 'VF5000000', daily_income = 1300000, validity_days = 4, thumbnail_url = '/hero_image.jpg', is_active = true where price = 5000000;

update public.platform_settings
  set value = 'Welcome to VivianFi. Deposit, activate a quantitative machine, and start earning daily returns.'
  where key = 'welcome_popup_message';
update public.platform_settings set value = '20' where key = 'withdraw_fee_percent';
update public.platform_settings set value = '23:00' where key = 'withdraw_end_time';
