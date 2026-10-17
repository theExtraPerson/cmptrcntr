# Supabase database setup

Use the SQL Editor in the Supabase project, or run the files with `psql` in the order below. Back up the database and test the scripts against a staging project before production. Do not run the legacy referral reconciliation unless historical commissions have been reviewed and explicitly need backfilling.

## Fresh project

1. Create a Supabase project and enable the required Auth provider.
2. Run `schema.sql`.
3. Run `marzpay_payments.sql`.
4. Run `referral_levels_migration.sql`.
5. Run `investment_eligibility_migration.sql`.
6. Run `verify_computer_center.sql`; all assertions must pass.
7. Register the first account, then grant it admin access using the SQL snippet below.
8. Configure the application environment variables from `.env.example`, including the production HTTPS `NEXT_PUBLIC_SITE_URL` and MarzPay credentials.

`product_catalog_migration.sql` is not part of the fresh-project path: `schema.sql` already creates the product columns, seeds the current catalogue, and defines product purchase behavior.

## Existing Computer Center / VivianFi project

1. Back up the database and pause deposits, withdrawals, and plan purchases while applying the upgrade.
2. Confirm the core tables from `schema.sql` already exist (`profiles`, `platform_settings`, `investment_products`, `user_investments`, and `income_history`). If they do not, stop and reconcile the database lineage before applying an upgrade.
3. Run `product_catalog_migration.sql`.
4. Run `marzpay_payments.sql`. This adds the payment ledger and copies legacy deposit/withdrawal rows into it without issuing new wallet credits.
5. Run `referral_levels_migration.sql`.
6. Run `investment_eligibility_migration.sql` to disable automatic daily wallet credits and enable end-of-term, admin-reviewed payouts.
7. Run `verify_computer_center.sql`; all assertions must pass.
8. Configure application environment variables and deploy the matching application version only after the database steps succeed.

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
- Plan earnings and any listed capital return are not credited daily. After the full term, a final payout is queued for administrator eligibility review. It remains pending until approved; approval records the payout and credits the member wallet.
- Withdrawal requests use the payment ledger and are subject to the configured procedures and administrator review.
- No provider-specific scheduled job is required by this database workflow. A plan's payout request is prepared when the member refreshes their account or an administrator opens the payout queue.
