# Supabase database setup

Use the SQL Editor in the Supabase project, or run the files with `psql` in the order below. Back up the database and test the scripts against a staging project before production. Do not run the legacy referral reconciliation unless historical commissions have been reviewed and explicitly need backfilling.

## Fresh project

1. Create a Supabase project and enable the required Auth provider.
2. Run `schema.sql`.
3. Run `marzpay_payments.sql`.
4. Run `daily_withdrawals_migration.sql`.
5. Run `withdrawal_eat_policy_migration.sql`.
6. Run `referral_levels_migration.sql`.
7. Run `investment_eligibility_migration.sql`.
8. Run `daily_reward_release_migration.sql` to enable daily EAT-midnight credits.
9. Run `verify_computer_center.sql`; all assertions must pass.
10. Register the first account, then grant it admin access using the SQL snippet below.
11. Configure the application environment variables from `.env.example`, including the production HTTPS `NEXT_PUBLIC_SITE_URL` and MarzPay credentials.

`product_catalog_migration.sql` is not part of the fresh-project path: `schema.sql` already creates the product columns, seeds the current catalogue, and defines product purchase behavior.

## Existing Computer Center / VivianFi project

1. Back up the database and pause deposits, withdrawals, and plan purchases while applying the upgrade.
2. Confirm the core tables from `schema.sql` already exist (`profiles`, `platform_settings`, `investment_products`, `user_investments`, and `income_history`). If they do not, stop and reconcile the database lineage before applying an upgrade.
3. Run `product_catalog_migration.sql`.
4. Run `marzpay_payments.sql`. This adds the payment ledger and copies legacy deposit/withdrawal rows into it without issuing new wallet credits.
5. Run `daily_withdrawals_migration.sql` to enforce the UGX 3,000 minimum and one withdrawal request per EAT calendar day.
6. Run `withdrawal_eat_policy_migration.sql` to normalize the withdrawal amount and hours on existing deployments.
7. Run `referral_levels_migration.sql`.
8. Run `investment_eligibility_migration.sql` to prepare the end-of-term payout workflow.
9. Run `daily_reward_release_migration.sql` to credit daily earnings at midnight EAT, catch up eligible prior days on the first run, and keep any capital return subject to end-of-term review.
10. Run `verify_computer_center.sql`; all assertions must pass.
11. Configure application environment variables and deploy the matching application version only after the database steps succeed.

Run each file from top to bottom. Files containing an explicit `begin`/`commit` run their own transaction. If a script fails, do not continue to later steps; inspect the error and the current database state first. Supabase SQL Editor does not keep this repository's migration history, so record the completed script names and date with your deployment record.

## Optional historical referral reconciliation

`referral_commission_migration.sql` is **not** required for normal installation or upgrades. It backfills missing 5%/1% commissions for already-approved legacy deposits. Its pre-check and post-check must be reviewed, and it should be run only when the business explicitly authorizes historical credits. Do not run it as part of a routine deployment.

## First administrator

After registering the first user, substitute that account's username and run:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin'
from public.profiles
where username = 'YOUR_USERNAME'
on conflict (user_id, role) do nothing;
```

## Payout and payment behavior

- A confirmed successful deposit is credited through `settle_payment`; its referral commissions are idempotent per payment and level.
- A product purchase debits the wallet and snapshots its plan terms.
- Eligible plan earnings are credited to the member wallet at midnight East Africa Time (UTC+3). The scheduled database job also catches up eligible days after downtime; account refreshes can trigger the same idempotent processing.
- Any listed capital return is queued for administrator eligibility review after the full plan term and all daily rewards have been released. It remains pending until approved; approval credits the member wallet.
- Withdrawal requests use the payment ledger and are subject to the configured procedures and administrator review.
- Users may request one withdrawal per EAT calendar day, with a UGX 3,000 minimum, from 09:00 to 22:00 EAT. Requests still pending at day-end carry forward and remain pending; they are not auto-approved or refunded.
- The `pg_cron` job `release-daily-investment-rewards-eat` runs at 21:00 UTC (00:00 EAT). Account refreshes and opening the admin payout queue are fallback processing triggers if a scheduled run is missed.
