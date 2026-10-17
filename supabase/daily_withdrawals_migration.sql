-- Enforce one withdrawal request per Kampala calendar day and a UGX 30,000 minimum.
-- Apply after marzpay_payments.sql.
begin;

insert into public.platform_settings (key, value)
values ('min_withdrawal', '30000')
on conflict (key) do update
set value = greatest(coalesce(nullif(public.platform_settings.value, '')::numeric, 0), 30000)::text,
    updated_at = now();

delete from public.platform_settings
where key in ('mtn_number', 'mtn_name', 'airtel_number', 'airtel_name');

insert into public.platform_settings (key, value)
values ('withdraw_start_time', '21:00'), ('withdraw_end_time', '22:00')
on conflict (key) do update
set value = excluded.value, updated_at = now();

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
  request_time timestamptz;
  kampala_day date;
  day_start timestamptz;
  next_day_start timestamptz;
begin
  if p_amount < 30000 or p_fee < 0 or p_net <= 0 or p_net <> p_amount - p_fee then
    raise exception 'Minimum withdrawal is UGX 30,000 and the amount/fee must be valid';
  end if;
  if p_phone !~ '^2567[0-9]{8}$' then
    raise exception 'Invalid Ugandan phone number';
  end if;
  if p_provider is null or p_provider not in ('MTN', 'AIRTEL') then
    raise exception 'Unsupported mobile money provider';
  end if;

  select balance into current_balance
    from public.profiles
    where id = p_user_id and not is_banned
    for update;
  if not found then raise exception 'Profile not found or account unavailable'; end if;

  request_time := clock_timestamp();
  kampala_day := (request_time at time zone 'Africa/Kampala')::date;
  day_start := kampala_day::timestamp at time zone 'Africa/Kampala';
  next_day_start := (kampala_day + 1)::timestamp at time zone 'Africa/Kampala';

  if exists (
    select 1
    from public.payments payment
    where payment.user_id = p_user_id
      and payment.type = 'WITHDRAWAL'
      and payment.created_at >= day_start
      and payment.created_at < next_day_start
  ) then
    raise exception 'Only one withdrawal request is allowed per Kampala calendar day';
  end if;

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

revoke all on function public.request_payment_withdraw(uuid, numeric, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.request_payment_withdraw(uuid, numeric, numeric, numeric, text, text)
  to service_role;

commit;