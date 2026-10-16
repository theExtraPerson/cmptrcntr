-- Apply after schema.sql to synchronize the Computer Center product catalogue
-- and snapshot each plan's terms when purchased. Then apply marzpay_payments.sql,
-- referral_levels_migration.sql, and investment_eligibility_migration.sql before
-- deploying the updated app.
begin;

alter table public.investment_products
  add column if not exists returns_capital boolean not null default true;
alter table public.investment_products
  add column if not exists total_earnings numeric generated always as (daily_income * validity_days) stored;

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

create or replace function public.process_user_payouts(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'payouts', 0,
    'credited', 0,
    'capital_returned', 0,
    'awaiting_review', 0
  );
end;
$$;

commit;
