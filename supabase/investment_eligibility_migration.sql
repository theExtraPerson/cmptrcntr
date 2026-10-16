-- Apply after product_catalog_migration.sql and referral_levels_migration.sql.
-- Replaces automatic daily credits with a single end-of-term payout requiring admin approval.
begin;

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

alter table public.investment_payouts enable row level security;
drop policy if exists "own investment payouts" on public.investment_payouts;
create policy "own investment payouts" on public.investment_payouts
  for select using (auth.uid() = user_id or public.is_admin());
grant select on public.investment_payouts to authenticated;
grant all on public.investment_payouts to service_role;

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

revoke all on function public.prepare_investment_payouts(uuid) from public, anon, authenticated;
revoke all on function public.review_investment_payout(uuid, uuid) from public, anon, authenticated;
revoke all on function public.process_user_payouts(uuid) from public, anon, authenticated;
grant execute on function public.prepare_investment_payouts(uuid) to service_role;
grant execute on function public.review_investment_payout(uuid, uuid) to service_role;
grant execute on function public.process_user_payouts(uuid) to service_role;

commit;
