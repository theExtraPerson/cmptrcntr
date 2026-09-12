-- VivianFi referral commission migration
-- Run this file in Supabase SQL Editor on an existing database.
-- It preserves existing rows and only adds missing referral commissions.
-- Review the pre-check result before running the transaction.

-- STEP 1: Pre-check. This is read-only.
select
  count(*) filter (where d.status = 'approved') as approved_deposits,
  count(*) filter (
    where d.status = 'approved'
      and exists (
        select 1 from public.user_investments i
        where i.user_id = d.user_id
      )
      and p.referred_by is not null
      and not exists (
        select 1 from public.income_history h
        where h.user_id = p.referred_by
          and h.type = 'referral'
          and h.source_id = d.id
      )
  ) as missing_referral_commissions
from public.deposits d
left join public.profiles p on p.id = d.user_id;

-- STEP 2: Apply the migration atomically.
begin;

create or replace function public.credit_referral_commission(p_deposit_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.deposits%rowtype;
  referrer uuid;
  commission numeric := 0;
  pct numeric;
begin
  select * into d
  from public.deposits
  where id = p_deposit_id;

  if not found or d.status <> 'approved' then
    return 0;
  end if;

  -- A commission is payable only after the referred user activates a product.
  if not exists (
    select 1 from public.user_investments
    where user_id = d.user_id
  ) then
    return 0;
  end if;

  select referred_by into referrer
  from public.profiles
  where id = d.user_id;

  if referrer is null then
    return 0;
  end if;

  -- Makes this migration safe to run more than once.
  if exists (
    select 1 from public.income_history
    where user_id = referrer
      and type = 'referral'
      and source_id = d.id
  ) then
    return 0;
  end if;

  select coalesce(nullif(value, '')::numeric, 5) into pct
  from public.platform_settings
  where key = 'referral_percent';

  commission := round(d.amount * coalesce(pct, 5) / 100, 0);

  if commission > 0 then
    update public.profiles
    set balance = balance + commission,
        total_income = total_income + commission,
        referral_income = referral_income + commission
    where id = referrer;

    insert into public.income_history (user_id, amount, type, source_id)
    values (referrer, commission, 'referral', d.id);
  end if;

  return commission;
end;
$$;

-- Future deposit approvals now use the corrected helper.
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
  select * into d
  from public.deposits
  where id = p_deposit_id
  for update;

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

-- Activation now pays commissions for approved deposits that existed first.
create or replace function public.buy_product(p_user_id uuid, p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.investment_products%rowtype;
  d public.deposits%rowtype;
  bal numeric;
  iid uuid;
begin
  select * into p
  from public.investment_products
  where id = p_product_id and is_active = true;
  if not found then raise exception 'Product not available'; end if;

  select balance into bal
  from public.profiles
  where id = p_user_id
  for update;
  if bal < p.price then raise exception 'Insufficient balance'; end if;

  update public.profiles
  set balance = balance - p.price
  where id = p_user_id;

  insert into public.user_investments (
    user_id, product_id, amount, daily_income, payouts_claimed, days_remaining,
    next_payout_at, is_active, capital_returned
  ) values (
    p_user_id, p.id, p.price, p.daily_income, 0, p.validity_days,
    now() + interval '24 hours', true, false
  ) returning id into iid;

  for d in
    select * from public.deposits
    where user_id = p_user_id and status = 'approved'
    order by created_at
  loop
    perform public.credit_referral_commission(d.id);
  end loop;

  return iid;
end;
$$;

revoke all on function public.credit_referral_commission(uuid) from public, anon, authenticated;
grant execute on function public.credit_referral_commission(uuid) to service_role;

-- STEP 3: Backfill only missing commissions.
-- Existing balances and income rows are untouched.
do $$
declare
  d record;
begin
  for d in
    select deposits.id
    from public.deposits
    where deposits.status = 'approved'
      and exists (
        select 1 from public.user_investments
        where user_investments.user_id = deposits.user_id
      )
  loop
    perform public.credit_referral_commission(d.id);
  end loop;
end;
$$;

commit;

-- STEP 4: Post-check. This should return zero.
select count(*) as remaining_missing_referral_commissions
from public.deposits d
join public.profiles p on p.id = d.user_id
where d.status = 'approved'
  and p.referred_by is not null
  and exists (
    select 1 from public.user_investments i
    where i.user_id = d.user_id
  )
  and not exists (
    select 1 from public.income_history h
    where h.user_id = p.referred_by
      and h.type = 'referral'
      and h.source_id = d.id
  );

-- STEP 5: Optional audit query.
select h.created_at, h.user_id as referrer_id, h.amount, h.source_id as deposit_id
from public.income_history h
where h.type = 'referral'
order by h.created_at desc;
