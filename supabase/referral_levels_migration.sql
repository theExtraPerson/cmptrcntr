-- Apply after schema.sql and marzpay_payments.sql.
-- Existing installs should run product_catalog_migration.sql before this if not already applied.
-- Normalizes invite codes and credits 5% / 1% commissions on successful deposits.
begin;

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

create unique index if not exists income_referral_payment_level_unique
  on public.income_history (user_id, source_id, type)
  where source_id is not null and type in ('referral_l1', 'referral_l2');

insert into public.platform_settings (key, value) values
  ('referral_level_1_percent', '5'),
  ('referral_level_2_percent', '1')
on conflict (key) do update set value = excluded.value, updated_at = now();

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
  deposit_row public.deposits%rowtype;
  commissions jsonb;
begin
  select * into deposit_row
  from public.deposits
  where id = p_deposit_id;
  if not found or deposit_row.status <> 'approved' then return 0; end if;

  commissions := public.credit_referral_commissions(
    deposit_row.user_id,
    deposit_row.amount,
    deposit_row.id
  );
  return coalesce((commissions->>'level_1')::numeric, 0)
       + coalesce((commissions->>'level_2')::numeric, 0);
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
  select * into payment
  from public.payments
  where id = _payment_id
  for update;
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

revoke all on function public.credit_referral_commissions(uuid, numeric, uuid)
  from public, anon, authenticated;
revoke all on function public.credit_referral_commission(uuid)
  from public, anon, authenticated;
revoke all on function public.settle_payment(uuid, boolean, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.credit_referral_commissions(uuid, numeric, uuid)
  to service_role;
grant execute on function public.credit_referral_commission(uuid)
  to service_role;
grant execute on function public.settle_payment(uuid, boolean, text, text, uuid)
  to service_role;

commit;
