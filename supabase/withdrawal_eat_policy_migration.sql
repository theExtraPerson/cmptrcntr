-- Set the minimum to UGX 3,000 and use EAT for withdrawal limits.
begin;

insert into public.platform_settings (key, value)
values
  ('min_withdrawal', '3000'),
  ('withdraw_start_time', '09:00'),
  ('withdraw_end_time', '22:00')
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
  eat_day date;
  day_start timestamptz;
  next_day_start timestamptz;
begin
  if p_amount < 3000 or p_fee < 0 or p_net <= 0 or p_net <> p_amount - p_fee then
    raise exception 'Minimum withdrawal is UGX 3,000 and the amount/fee must be valid';
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
  eat_day := (request_time at time zone 'UTC' + interval '3 hours')::date;
  day_start := (eat_day::timestamp - interval '3 hours') at time zone 'UTC';
  next_day_start := ((eat_day + 1)::timestamp - interval '3 hours') at time zone 'UTC';

  if exists (
    select 1
    from public.payments payment
    where payment.user_id = p_user_id
      and payment.type = 'WITHDRAWAL'
      and payment.created_at >= day_start
      and payment.created_at < next_day_start
  ) then
    raise exception 'Only one withdrawal request is allowed per EAT calendar day';
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
