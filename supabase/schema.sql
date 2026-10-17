-- Computer Center schema
-- Fresh-install and upgrade instructions: see supabase/README.md.
-- This file is the core schema; payment, referral-level, and final-payout
-- objects are installed by the ordered scripts listed in that runbook.
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

do $$
declare
  profile record;
  normalized_code text;
begin
  for profile in
    select id, referral_code, created_at
    from public.profiles
    order by created_at desc, id desc
  loop
    normalized_code := upper(btrim(profile.referral_code));
    if normalized_code = ''
       or exists (
         select 1 from public.profiles other
         where other.id <> profile.id
           and lower(btrim(other.referral_code)) = lower(normalized_code)
           and (other.created_at, other.id) < (profile.created_at, profile.id)
       ) then
      loop
        normalized_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
        exit when not exists (
          select 1 from public.profiles other
          where other.id <> profile.id
            and lower(btrim(other.referral_code)) = lower(normalized_code)
        );
      end loop;
    end if;
    update public.profiles
    set referral_code = normalized_code
    where id = profile.id and referral_code is distinct from normalized_code;
  end loop;
end;
$$;

create unique index if not exists profiles_referral_code_normalized_unique
  on public.profiles (lower(btrim(referral_code)));

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
  returns_capital boolean not null default true,
  total_earnings numeric generated always as (daily_income * validity_days) stored,
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
  product_name text,
  amount numeric not null,
  daily_income numeric not null,
  validity_days integer not null default 4,
  total_earnings numeric not null,
  returns_capital boolean not null default true,
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

create table if not exists public.investment_payouts (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.user_investments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payout_type text not null default 'FINAL' check (payout_type = 'FINAL'),
  payout_number integer not null default 1 check (payout_number = 1),
  amount numeric not null check (amount > 0),
  earnings_amount numeric not null check (earnings_amount >= 0),
  capital_amount numeric not null check (capital_amount >= 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (investment_id, payout_type, payout_number),
  check (amount = earnings_amount + capital_amount)
);

create index if not exists investment_payouts_status_created_idx
  on public.investment_payouts(status, created_at);
create index if not exists investment_payouts_user_created_idx
  on public.investment_payouts(user_id, created_at desc);

create unique index if not exists income_referral_payment_level_unique
  on public.income_history (user_id, source_id, type)
  where source_id is not null and type in ('referral_l1', 'referral_l2');

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
alter table public.investment_products add column if not exists returns_capital boolean not null default true;
alter table public.investment_products
  add column if not exists total_earnings numeric generated always as (daily_income * validity_days) stored;
alter table public.user_investments alter column days_remaining set default 4;
alter table public.user_investments add column if not exists product_name text;
alter table public.user_investments add column if not exists validity_days integer;
alter table public.user_investments add column if not exists total_earnings numeric;
alter table public.user_investments add column if not exists returns_capital boolean;

update public.user_investments investment
set product_name = coalesce(investment.product_name, product.name),
    validity_days = coalesce(investment.validity_days, greatest(investment.payouts_claimed + investment.days_remaining, 1)),
    total_earnings = coalesce(
      investment.total_earnings,
      investment.daily_income * greatest(investment.payouts_claimed + investment.days_remaining, 1)
    ),
    returns_capital = coalesce(investment.returns_capital, true)
from public.investment_products product
where investment.product_id = product.id
  and (
    investment.product_name is null
    or investment.validity_days is null
    or investment.total_earnings is null
    or investment.returns_capital is null
  );

update public.user_investments
set validity_days = coalesce(validity_days, greatest(payouts_claimed + days_remaining, 1)),
    total_earnings = coalesce(
      total_earnings,
      daily_income * greatest(payouts_claimed + days_remaining, 1)
    ),
    returns_capital = coalesce(returns_capital, true);
alter table public.user_investments alter column validity_days set not null;
alter table public.user_investments alter column total_earnings set not null;
alter table public.user_investments alter column returns_capital set default true;
alter table public.user_investments alter column returns_capital set not null;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.investment_products enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.user_investments enable row level security;
alter table public.income_history enable row level security;
alter table public.investment_payouts enable row level security;
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
drop policy if exists "own investment payouts" on public.investment_payouts;
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
create policy "own investment payouts" on public.investment_payouts
  for select using (auth.uid() = user_id or public.is_admin());
grant select on public.investment_payouts to authenticated;
grant all on public.investment_payouts to service_role;
create policy "stories public" on public.success_stories for select using (is_published = true or public.is_admin());

create or replace function public.credit_referral_commissions(
  p_referred_user_id uuid,
  p_deposit_amount numeric,
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  first_level_referrer uuid;
  referral_pct numeric;
  commission numeric;
  entry_id uuid;
  level_one_paid numeric := 0;
  level_two_paid numeric := 0;
begin
  if p_deposit_amount <= 0 then
    return jsonb_build_object('level_1', 0, 'level_2', 0);
  end if;

  select referred_by into first_level_referrer
  from public.profiles
  where id = p_referred_user_id;

  for target in
    select 1 as referral_level, child.referred_by as beneficiary_id
    from public.profiles child
    where child.id = p_referred_user_id
    union all
    select 2 as referral_level, parent.referred_by as beneficiary_id
    from public.profiles child
    join public.profiles parent on parent.id = child.referred_by
    where child.id = p_referred_user_id
  loop
    if target.beneficiary_id is null
       or target.beneficiary_id = p_referred_user_id
       or (target.referral_level = 2 and target.beneficiary_id = first_level_referrer) then
      continue;
    end if;
    if target.referral_level = 1 and exists (
      select 1 from public.income_history
      where user_id = target.beneficiary_id
        and source_id = p_source_id
        and type = 'referral'
    ) then
      continue;
    end if;

    if target.referral_level = 1 then
      select coalesce(nullif(value, '')::numeric, 5) into referral_pct
      from public.platform_settings where key = 'referral_level_1_percent';
      if not found then referral_pct := 5; end if;
    else
      select coalesce(nullif(value, '')::numeric, 1) into referral_pct
      from public.platform_settings where key = 'referral_level_2_percent';
      if not found then referral_pct := 1; end if;
    end if;

    commission := round(p_deposit_amount * referral_pct / 100, 0);
    if commission <= 0 then continue; end if;

    entry_id := null;
    insert into public.income_history (user_id, amount, type, source_id)
    values (
      target.beneficiary_id,
      commission,
      case target.referral_level when 1 then 'referral_l1' else 'referral_l2' end,
      p_source_id
    )
    on conflict (user_id, source_id, type)
      where source_id is not null and type in ('referral_l1', 'referral_l2')
      do nothing
    returning id into entry_id;

    if entry_id is not null then
      update public.profiles
      set balance = balance + commission,
          total_income = total_income + commission,
          referral_income = referral_income + commission
      where id = target.beneficiary_id;
      if target.referral_level = 1 then
        level_one_paid := level_one_paid + commission;
      else
        level_two_paid := level_two_paid + commission;
      end if;
    end if;
  end loop;

  return jsonb_build_object('level_1', level_one_paid, 'level_2', level_two_paid);
end;
$$;

create or replace function public.credit_referral_commission(p_deposit_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
  commissions jsonb;
begin
  select * into d from public.deposits where id = p_deposit_id;
  if not found or d.status <> 'approved' then
    return 0;
  end if;
  commissions := public.credit_referral_commissions(d.user_id, d.amount, d.id);
  return coalesce((commissions->>'level_1')::numeric, 0)
       + coalesce((commissions->>'level_2')::numeric, 0);
end;
$$;

create or replace function public.approve_deposit(p_deposit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
  commission numeric;
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

  commission := public.credit_referral_commission(d.id);

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
  select * into p
  from public.investment_products
  where id = p_product_id and is_active = true
  for share;
  if not found then raise exception 'Product not available'; end if;

  select balance into bal
  from public.profiles
  where id = p_user_id and not is_banned
  for update;
  if not found then raise exception 'Profile not found or account unavailable'; end if;
  if bal < p.price then raise exception 'Insufficient balance'; end if;

  update public.profiles set balance = balance - p.price where id = p_user_id;

  insert into public.user_investments (
    user_id, product_id, product_name, amount, daily_income, validity_days,
    total_earnings, returns_capital, payouts_claimed, days_remaining,
    next_payout_at, is_active, capital_returned
  ) values (
    p_user_id, p.id, p.name, p.price, p.daily_income, p.validity_days,
    p.total_earnings, p.returns_capital, 0, p.validity_days,
    now() + (p.validity_days * interval '24 hours'), true, false
  ) returning id into iid;

  return iid;
end;
$$;

create or replace function public.prepare_investment_payouts(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued integer := 0;
begin
  insert into public.investment_payouts (
    investment_id, user_id, payout_type, payout_number, amount,
    earnings_amount, capital_amount
  )
  select investment.id,
         investment.user_id,
         'FINAL',
         1,
         greatest(investment.validity_days - investment.payouts_claimed, 0) * investment.daily_income
           + case when investment.returns_capital and not investment.capital_returned
                  then investment.amount else 0 end,
         greatest(investment.validity_days - investment.payouts_claimed, 0) * investment.daily_income,
         case when investment.returns_capital and not investment.capital_returned
              then investment.amount else 0 end
  from public.user_investments investment
  where investment.is_active
    and investment.created_at + (investment.validity_days * interval '24 hours') <= now()
    and (
      greatest(investment.validity_days - investment.payouts_claimed, 0) * investment.daily_income
      + case when investment.returns_capital and not investment.capital_returned
             then investment.amount else 0 end
    ) > 0
    and (p_user_id is null or investment.user_id = p_user_id)
  on conflict (investment_id, payout_type, payout_number) do nothing;
  get diagnostics queued = row_count;

  update public.user_investments investment
  set days_remaining = 0,
      is_active = case
        when greatest(investment.validity_days - investment.payouts_claimed, 0) * investment.daily_income
               + case when investment.returns_capital and not investment.capital_returned
                      then investment.amount else 0 end = 0
          then false
        else investment.is_active
      end,
      payouts_claimed = case
        when greatest(investment.validity_days - investment.payouts_claimed, 0) * investment.daily_income
               + case when investment.returns_capital and not investment.capital_returned
                      then investment.amount else 0 end = 0
          then investment.validity_days
        else investment.payouts_claimed
      end
  where investment.is_active
    and investment.created_at + (investment.validity_days * interval '24 hours') <= now()
    and (
      investment.days_remaining <> 0
      or (
        greatest(investment.validity_days - investment.payouts_claimed, 0) * investment.daily_income
        + case when investment.returns_capital and not investment.capital_returned
               then investment.amount else 0 end
      ) = 0
    )
    and (p_user_id is null or investment.user_id = p_user_id);

  return queued;
end;
$$;

create or replace function public.review_investment_payout(
  p_payout_id uuid,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payout public.investment_payouts%rowtype;
  investment public.user_investments%rowtype;
begin
  select * into payout
  from public.investment_payouts
  where id = p_payout_id
  for update;
  if not found then raise exception 'Earnings request not found'; end if;
  if payout.status <> 'PENDING' then raise exception 'Final payout has already been approved'; end if;

  select * into investment
  from public.user_investments
  where id = payout.investment_id
  for update;
  if not found or investment.user_id <> payout.user_id then
    raise exception 'Investment record is not available';
  end if;

  if investment.created_at + (investment.validity_days * interval '24 hours') > now()
     or payout.payout_type <> 'FINAL'
     or payout.payout_number <> 1 then
    raise exception 'Investment duration has not completed';
  end if;

  update public.investment_payouts
  set status = 'APPROVED', reviewed_by = p_reviewer_id, reviewed_at = now()
  where id = payout.id;

  update public.profiles
  set balance = balance + payout.amount,
      total_income = total_income + payout.earnings_amount
  where id = payout.user_id;
  if payout.earnings_amount > 0 then
    insert into public.income_history (user_id, amount, type, source_id)
    values (payout.user_id, payout.earnings_amount, 'plan_earnings', investment.id);
  end if;
  if payout.capital_amount > 0 then
    insert into public.income_history (user_id, amount, type, source_id)
    values (payout.user_id, payout.capital_amount, 'capital', investment.id);
  end if;

  update public.user_investments
  set is_active = false,
      payouts_claimed = validity_days,
      days_remaining = 0,
      capital_returned = capital_returned or payout.capital_amount > 0,
      last_claimed_at = now()
  where id = investment.id;

  return jsonb_build_object('ok', true, 'status', 'APPROVED', 'amount', payout.amount);
end;
$$;

create or replace function public.process_user_payouts(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  queued integer;
begin
  queued := public.prepare_investment_payouts(p_user_id);
  return jsonb_build_object(
    'payouts', 0,
    'credited', 0,
    'capital_returned', 0,
    'awaiting_review', queued
  );
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
revoke all on function public.credit_referral_commissions(uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.credit_referral_commission(uuid) from public, anon, authenticated;
revoke all on function public.reject_deposit(uuid) from public, anon, authenticated;
revoke all on function public.request_withdraw(uuid, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.reject_withdraw(uuid) from public, anon, authenticated;
revoke all on function public.approve_withdraw(uuid) from public, anon, authenticated;
revoke all on function public.buy_product(uuid, uuid) from public, anon, authenticated;
revoke all on function public.prepare_investment_payouts(uuid) from public, anon, authenticated;
revoke all on function public.review_investment_payout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.process_user_payouts(uuid) from public, anon, authenticated;
revoke all on function public.adjust_user_balance(uuid, numeric) from public, anon, authenticated;

grant execute on function public.approve_deposit(uuid) to service_role;
grant execute on function public.credit_referral_commissions(uuid, numeric, uuid) to service_role;
grant execute on function public.credit_referral_commission(uuid) to service_role;
grant execute on function public.reject_deposit(uuid) to service_role;
grant execute on function public.request_withdraw(uuid, numeric, numeric, numeric, text) to service_role;
grant execute on function public.reject_withdraw(uuid) to service_role;
grant execute on function public.approve_withdraw(uuid) to service_role;
grant execute on function public.buy_product(uuid, uuid) to service_role;
grant execute on function public.prepare_investment_payouts(uuid) to service_role;
grant execute on function public.review_investment_payout(uuid, uuid) to service_role;
grant execute on function public.process_user_payouts(uuid) to service_role;
grant execute on function public.adjust_user_balance(uuid, numeric) to service_role;

insert into public.platform_settings (key, value) values
  ('welcome_popup_enabled', 'true'),
  ('welcome_popup_message', 'Welcome to Computer Center. Review the partnership terms, business risks, and plan conditions before participating.'),
  ('min_deposit', '5000'),
  ('max_deposit', '5000000'),
  ('min_withdrawal', '30000'),
  ('max_withdrawal', '5000000'),
  ('withdraw_fee_percent', '20'),
  ('withdraw_start_time', '21:00'),
  ('withdraw_end_time', '22:00'),
  ('telegram_support', 'https://t.me/+256704057716'),
  ('whatsapp_group', 'https://chat.whatsapp.com/BaxNRCmfLKO9OJIPpRDbbA'),
  ('force_refresh_timestamp', '0'),
  ('referral_level_1_percent', '5'),
  ('referral_level_2_percent', '1')
on conflict (key) do nothing;

update public.investment_products set is_active = false;

insert into public.investment_products (
  name, price, daily_income, validity_days, returns_capital, thumbnail_url, is_active
)
select catalog.name, catalog.price, catalog.daily_income, catalog.validity_days, true, null, true
from (values
  ('Mini Laptop', 5000::numeric, 1300::numeric, 5),
  ('Desk PC', 20000::numeric, 5060::numeric, 4),
  ('HP Laptop', 50000::numeric, 13000::numeric, 4),
  ('Dell Latitude', 80000::numeric, 20000::numeric, 4),
  ('Lenovo', 160000::numeric, 41700::numeric, 4),
  ('MacBook Air', 200000::numeric, 52200::numeric, 3),
  ('MacBook Pro', 400000::numeric, 107000::numeric, 3)
) as catalog(name, price, daily_income, validity_days)
where not exists (
  select 1 from public.investment_products existing where existing.price = catalog.price
);

update public.investment_products product
set name = catalog.name,
    daily_income = catalog.daily_income,
    validity_days = catalog.validity_days,
    returns_capital = true,
    thumbnail_url = null,
    is_active = true
from (values
  ('Mini Laptop', 5000::numeric, 1300::numeric, 5),
  ('Desk PC', 20000::numeric, 5060::numeric, 4),
  ('HP Laptop', 50000::numeric, 13000::numeric, 4),
  ('Dell Latitude', 80000::numeric, 20000::numeric, 4),
  ('Lenovo', 160000::numeric, 41700::numeric, 4),
  ('MacBook Air', 200000::numeric, 52200::numeric, 3),
  ('MacBook Pro', 400000::numeric, 107000::numeric, 3)
) as catalog(name, price, daily_income, validity_days)
where product.price = catalog.price;

with ranked_catalog_products as (
  select product.id,
         row_number() over (
           partition by product.price
           order by (
             select count(*)
             from public.user_investments investment
             where investment.product_id = product.id
           ) desc, product.created_at, product.id
         ) as product_rank
  from public.investment_products product
  where product.price in (5000, 20000, 50000, 80000, 160000, 200000, 400000)
)
update public.investment_products product
set is_active = (ranked_catalog_products.product_rank = 1)
from ranked_catalog_products
where product.id = ranked_catalog_products.id;

update public.platform_settings
  set value = 'Welcome to Computer Center. Review the partnership terms, business risks, and plan conditions before participating.'
  where key = 'welcome_popup_message';
update public.platform_settings set value = '20' where key = 'withdraw_fee_percent';
update public.platform_settings set value = '30000' where key = 'min_withdrawal';
update public.platform_settings set value = '21:00' where key = 'withdraw_start_time';
update public.platform_settings set value = '22:00' where key = 'withdraw_end_time';
