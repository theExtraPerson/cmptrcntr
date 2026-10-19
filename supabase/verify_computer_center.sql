-- Read-only installation checks. Run after completing the ordered steps in README.md.

do $$
declare
  relation_name text;
  required_relations text[] := array[
    'profiles',
    'user_roles',
    'platform_settings',
    'investment_products',
    'deposits',
    'withdrawals',
    'user_investments',
    'income_history',
    'investment_daily_rewards',
    'payments',
    'investment_payouts',
    'success_stories'
  ];
  required_functions text[] := array[
    'public.settle_payment(uuid,boolean,text,text,uuid)',
    'public.request_payment_withdraw(uuid,numeric,numeric,numeric,text,text)',
    'public.credit_referral_commissions(uuid,numeric,uuid)',
    'public.release_daily_investment_rewards(uuid)',
    'public.prepare_investment_payouts(uuid)',
    'public.review_investment_payout(uuid,uuid)',
    'public.process_user_payouts(uuid)',
    'public.buy_product(uuid,uuid)'
  ];
  function_name text;
begin
  foreach relation_name in array required_relations loop
    if to_regclass('public.' || relation_name) is null then
      raise exception 'Required relation public.% is missing', relation_name;
    end if;
  end loop;

  foreach function_name in array required_functions loop
    if to_regprocedure(function_name) is null then
      raise exception 'Required function % is missing', function_name;
    end if;
  end loop;

  if exists (
    select 1
    from unnest(array['profiles', 'payments', 'investment_payouts']) as required(table_name)
    join pg_class relation on relation.oid = to_regclass('public.' || required.table_name)
    where not relation.relrowsecurity
  ) then
    raise exception 'Row-level security must be enabled on profiles, payments, and investment_payouts';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.review_investment_payout(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role must be able to execute public.review_investment_payout';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.settle_payment(uuid,boolean,text,text,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role must be able to execute public.settle_payment';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.release_daily_investment_rewards(uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role must be able to execute public.release_daily_investment_rewards';
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname = 'release-daily-investment-rewards-eat'
      and schedule = '0 21 * * *'
  ) then
    raise exception 'Daily investment rewards must be scheduled for midnight EAT';
  end if;

  if not exists (
    select 1 from public.platform_settings
    where key = 'min_withdrawal' and value::numeric >= 3000
  ) then
    raise exception 'Minimum withdrawal must be at least UGX 3,000';
  end if;

  if exists (
    with expected(name, price, daily_income, validity_days) as (
      values
        ('Mini Laptop', 5000::numeric, 1300::numeric, 5),
        ('Desk PC', 20000::numeric, 5060::numeric, 4),
        ('HP Laptop', 50000::numeric, 13000::numeric, 4),
        ('Dell Latitude', 80000::numeric, 20000::numeric, 4),
        ('Lenovo', 160000::numeric, 41700::numeric, 4),
        ('MacBook Air', 200000::numeric, 52200::numeric, 3),
        ('MacBook Pro', 400000::numeric, 107000::numeric, 3)
    )
    select 1
    from expected
    left join public.investment_products product
      on product.name = expected.name
     and product.price = expected.price
     and product.daily_income = expected.daily_income
     and product.validity_days = expected.validity_days
     and product.returns_capital
    where product.id is null
  ) then
    raise exception 'One or more expected partnership products are missing or have different plan terms';
  end if;
end;
$$;

select
  (select count(*) from public.investment_products where is_active) as active_products,
  (select count(*) from public.payments) as payment_ledger_rows,
  (select count(*) from public.investment_daily_rewards) as daily_reward_rows,
  (select count(*) from public.investment_payouts where status = 'PENDING') as pending_final_payouts,
  (select count(*) from public.profiles) as profiles;
