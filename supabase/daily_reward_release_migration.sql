begin;

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.investment_daily_rewards (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.user_investments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_date date not null,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (investment_id, reward_date)
);

create index if not exists investment_daily_rewards_user_created_idx
  on public.investment_daily_rewards(user_id, created_at desc);

alter table public.investment_daily_rewards enable row level security;
grant all on public.investment_daily_rewards to service_role;

create or replace function public.release_daily_investment_rewards(p_user_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released integer := 0;
begin
  perform 1
  from public.user_investments investment
  where investment.daily_income > 0
    and investment.validity_days > investment.payouts_claimed
    and (investment.created_at at time zone 'Africa/Nairobi')::date
          + investment.payouts_claimed
        <= (now() at time zone 'Africa/Nairobi')::date - 1
    and (investment.is_active or exists (
      select 1
      from public.investment_payouts payout
      where payout.investment_id = investment.id
        and payout.status = 'PENDING'
        and payout.payout_type = 'FINAL'
    ))
    and (p_user_id is null or investment.user_id = p_user_id)
  order by investment.id
  for update;

  with eligible_days as (
    select investment.id as investment_id,
           investment.user_id,
           investment.daily_income as amount,
           days.reward_day::date as reward_date
    from public.user_investments investment
    cross join lateral generate_series(
      (investment.created_at at time zone 'Africa/Nairobi')::date + investment.payouts_claimed,
      least(
        (now() at time zone 'Africa/Nairobi')::date - 1,
        (investment.created_at at time zone 'Africa/Nairobi')::date + investment.validity_days - 1
      ),
      interval '1 day'
    ) as days(reward_day)
    where investment.daily_income > 0
      and investment.validity_days > investment.payouts_claimed
      and (investment.is_active or exists (
        select 1
        from public.investment_payouts payout
        where payout.investment_id = investment.id
          and payout.status = 'PENDING'
          and payout.payout_type = 'FINAL'
      ))
      and (p_user_id is null or investment.user_id = p_user_id)
  ),
  inserted_rewards as (
    insert into public.investment_daily_rewards (
      investment_id, user_id, reward_date, amount
    )
    select investment_id, user_id, reward_date, amount
    from eligible_days
    on conflict (investment_id, reward_date) do nothing
    returning investment_id, user_id, reward_date, amount
  ),
  updated_profiles as (
    update public.profiles profile
    set balance = profile.balance + reward_totals.amount,
        total_income = profile.total_income + reward_totals.amount
    from (
      select user_id, sum(amount) as amount
      from inserted_rewards
      group by user_id
    ) reward_totals
    where profile.id = reward_totals.user_id
    returning profile.id
  ),
  inserted_history as (
    insert into public.income_history (user_id, amount, type, source_id, created_at)
    select user_id, amount, 'plan_earnings', investment_id, now()
    from inserted_rewards
    returning id
  ),
  updated_investments as (
    update public.user_investments investment
    set payouts_claimed = least(
          investment.validity_days,
          investment.payouts_claimed + reward_totals.reward_count
        ),
        days_remaining = greatest(
          investment.validity_days - investment.payouts_claimed - reward_totals.reward_count,
          0
        ),
        last_claimed_at = now()
    from (
      select investment_id, count(*)::integer as reward_count
      from inserted_rewards
      group by investment_id
    ) reward_totals
    where investment.id = reward_totals.investment_id
    returning investment.id
  )
  select count(*)::integer into released
  from inserted_rewards;

  return released;
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
  perform public.release_daily_investment_rewards(p_user_id);

  insert into public.investment_payouts (
    investment_id, user_id, payout_type, payout_number, amount,
    earnings_amount, capital_amount
  )
  select investment.id,
         investment.user_id,
         'FINAL',
         1,
         investment.amount,
         0,
         investment.amount
  from public.user_investments investment
  where investment.is_active
    and investment.returns_capital
    and not investment.capital_returned
    and investment.created_at + (investment.validity_days * interval '24 hours') <= now()
    and investment.payouts_claimed >= investment.validity_days
    and (p_user_id is null or investment.user_id = p_user_id)
  on conflict (investment_id, payout_type, payout_number) do nothing;
  get diagnostics queued = row_count;

  update public.user_investments investment
  set days_remaining = 0,
      is_active = false,
      payouts_claimed = investment.validity_days
  where investment.is_active
    and investment.created_at + (investment.validity_days * interval '24 hours') <= now()
    and investment.payouts_claimed >= investment.validity_days
    and (not investment.returns_capital or investment.capital_returned)
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
  if not found then raise exception 'Final payout request not found'; end if;
  if payout.status <> 'PENDING' then raise exception 'Final payout has already been approved'; end if;

  select * into investment
  from public.user_investments
  where id = payout.investment_id
  for update;
  if not found or investment.user_id <> payout.user_id then
    raise exception 'Investment record is not available';
  end if;

  if investment.created_at + (investment.validity_days * interval '24 hours') > now()
     or investment.payouts_claimed < investment.validity_days
     or payout.payout_type <> 'FINAL'
     or payout.payout_number <> 1 then
    raise exception 'Investment duration or daily rewards have not completed';
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
  released integer;
begin
  released := public.release_daily_investment_rewards(p_user_id);
  queued := public.prepare_investment_payouts(p_user_id);
  return jsonb_build_object(
    'payouts', 0,
    'credited', released,
    'capital_returned', 0,
    'awaiting_review', queued
  );
end;
$$;

update public.investment_payouts
set amount = capital_amount,
    earnings_amount = 0
where status = 'PENDING'
  and payout_type = 'FINAL'
  and capital_amount > 0;

delete from public.investment_payouts
where status = 'PENDING'
  and payout_type = 'FINAL'
  and capital_amount = 0;

revoke all on function public.release_daily_investment_rewards(uuid) from public, anon, authenticated;
revoke all on function public.prepare_investment_payouts(uuid) from public, anon, authenticated;
revoke all on function public.review_investment_payout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.process_user_payouts(uuid) from public, anon, authenticated;
grant execute on function public.release_daily_investment_rewards(uuid) to service_role;
grant execute on function public.prepare_investment_payouts(uuid) to service_role;
grant execute on function public.review_investment_payout(uuid, uuid) to service_role;
grant execute on function public.process_user_payouts(uuid) to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname = 'release-daily-investment-rewards-eat';

select cron.schedule(
  'release-daily-investment-rewards-eat',
  '0 21 * * *',
  'select public.prepare_investment_payouts(null);'
);

commit;
