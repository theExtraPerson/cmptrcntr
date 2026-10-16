-- MarzPay-backed payment ledger.
-- Apply after schema.sql. Legacy deposits and withdrawals are copied into the
-- ledger as manual payments so their history remains available in the UI.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('DEPOSIT', 'WITHDRAWAL')),
  mode text not null check (mode in ('MARZPAY', 'MANUAL')),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED')),
  provider text check (provider in ('MTN', 'AIRTEL')),
  amount numeric not null check (amount > 0),
  fee numeric not null default 0 check (fee >= 0),
  net_amount numeric not null check (net_amount > 0),
  phone_number text not null,
  external_reference text not null unique,
  provider_tx_uuid text,
  provider_reference text,
  failure_reason text,
  admin_note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payments_provider_tx_uuid_unique
  on public.payments(provider_tx_uuid) where provider_tx_uuid is not null;
create unique index if not exists payments_provider_reference_unique
  on public.payments(provider_reference) where provider_reference is not null;
create index if not exists payments_user_created_idx
  on public.payments(user_id, created_at desc);
create index if not exists payments_unsettled_idx
  on public.payments(status, updated_at) where status in ('PENDING', 'PROCESSING');

alter table public.payments enable row level security;
drop policy if exists "own payments" on public.payments;
create policy "own payments" on public.payments
  for select using (auth.uid() = user_id or public.is_admin());
grant select on public.payments to authenticated;
grant all on public.payments to service_role;

insert into public.payments (
  id, user_id, type, mode, status, provider, amount, fee, net_amount,
  phone_number, external_reference, reviewed_at, created_at, updated_at
)
select
  d.id, d.user_id, 'DEPOSIT', 'MANUAL',
  case d.status when 'approved' then 'SUCCESS' when 'rejected' then 'FAILED' else 'PENDING' end,
  case upper(d.payment_method) when 'MTN' then 'MTN' when 'AIRTEL' then 'AIRTEL' else null end,
  d.amount, 0, d.amount, coalesce(d.sender_phone, p.phone),
  'legacy:deposit:' || d.id::text, d.approved_at, d.created_at, coalesce(d.approved_at, d.created_at)
from public.deposits d
join public.profiles p on p.id = d.user_id
where not exists (
  select 1 from public.payments payment where payment.external_reference = 'legacy:deposit:' || d.id::text
);

insert into public.payments (
  id, user_id, type, mode, status, amount, fee, net_amount, phone_number,
  external_reference, reviewed_at, created_at, updated_at
)
select
  w.id, w.user_id, 'WITHDRAWAL', 'MANUAL',
  case w.status when 'approved' then 'SUCCESS' when 'rejected' then 'FAILED' else 'PENDING' end,
  w.amount, w.fee, w.net_amount, w.phone, 'legacy:withdrawal:' || w.id::text,
  case when w.status = 'pending' then null else w.created_at end,
  w.created_at, w.created_at
from public.withdrawals w
where not exists (
  select 1 from public.payments payment where payment.external_reference = 'legacy:withdrawal:' || w.id::text
);

create or replace function public.request_payment_withdraw(
  p_user_id uuid,
  p_amount numeric,
  p_fee numeric,
  p_net numeric,
  p_phone text,
  p_provider text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance numeric;
  payment_id uuid;
begin
  if p_amount <= 0 or p_fee < 0 or p_net <= 0 or p_net <> p_amount - p_fee then
    raise exception 'Invalid withdrawal amount or fee';
  end if;
  if p_phone !~ '^2567[0-9]{8}$' then
    raise exception 'Invalid Ugandan phone number';
  end if;
  if p_provider is null or p_provider not in ('MTN', 'AIRTEL') then
    raise exception 'Unsupported mobile money provider';
  end if;

  select balance into current_balance
    from public.profiles where id = p_user_id and not is_banned for update;
  if not found then raise exception 'Profile not found or account unavailable'; end if;
  if current_balance < p_amount then raise exception 'Insufficient balance'; end if;

  update public.profiles
    set balance = balance - p_amount,
        total_withdrawals = total_withdrawals + p_amount
    where id = p_user_id;

  insert into public.payments (
    user_id, type, mode, status, provider, amount, fee, net_amount,
    phone_number, external_reference
  ) values (
    p_user_id, 'WITHDRAWAL', 'MARZPAY', 'PENDING', p_provider,
    p_amount, p_fee, p_net, p_phone, gen_random_uuid()::text
  ) returning id into payment_id;

  return payment_id;
end;
$$;

create unique index if not exists income_referral_payment_level_unique
  on public.income_history (user_id, source_id, type)
  where source_id is not null and type in ('referral_l1', 'referral_l2');

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

create or replace function public.settle_payment(
  _payment_id uuid,
  _ok boolean,
  _reason text default null,
  _provider_tx text default null,
  _reviewer uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payment public.payments%rowtype;
  new_status text;
begin
  select * into payment from public.payments where id = _payment_id for update;
  if not found then raise exception 'Payment not found'; end if;

  if payment.status in ('SUCCESS', 'FAILED', 'CANCELLED') then
    return jsonb_build_object('ok', true, 'status', payment.status);
  end if;
  if _ok and payment.type = 'WITHDRAWAL'
     and payment.reviewed_by is null and _reviewer is null then
    raise exception 'Withdrawal must be approved before it can be settled';
  end if;

  new_status := case when _ok then 'SUCCESS' else 'FAILED' end;
  update public.payments
    set status = new_status,
        failure_reason = case when _ok then null else left(coalesce(_reason, 'Payment failed'), 500) end,
        admin_note = null,
        provider_tx_uuid = coalesce(_provider_tx, provider_tx_uuid),
        reviewed_by = coalesce(_reviewer, reviewed_by),
        reviewed_at = case when _reviewer is not null then coalesce(reviewed_at, now()) else reviewed_at end,
        updated_at = now()
    where id = _payment_id;

  if _ok and payment.type = 'DEPOSIT' then
    update public.profiles
      set balance = balance + payment.amount,
          total_deposits = total_deposits + payment.amount
      where id = payment.user_id;
    insert into public.income_history (user_id, amount, type, source_id)
      values (payment.user_id, payment.amount, 'deposit', payment.id);
    perform public.credit_referral_commissions(payment.user_id, payment.amount, payment.id);
  elsif not _ok and payment.type = 'WITHDRAWAL' then
    update public.profiles
      set balance = balance + payment.amount,
          total_withdrawals = greatest(total_withdrawals - payment.amount, 0)
      where id = payment.user_id;
  end if;

  return jsonb_build_object('ok', true, 'status', new_status);
end;
$$;

revoke all on function public.request_payment_withdraw(uuid, numeric, numeric, numeric, text, text)
  from public, anon, authenticated;
revoke all on function public.credit_referral_commissions(uuid, numeric, uuid)
  from public, anon, authenticated;
revoke all on function public.settle_payment(uuid, boolean, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.request_payment_withdraw(uuid, numeric, numeric, numeric, text, text)
  to service_role;
grant execute on function public.credit_referral_commissions(uuid, numeric, uuid)
  to service_role;
grant execute on function public.settle_payment(uuid, boolean, text, text, uuid)
  to service_role;
