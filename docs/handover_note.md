# Handover note: GigTask (Project 5), inherited from Team 14

**Inherited repo:** `ygd06/14_a1`, final commit `af2b0039d80bd9f2ccb15deb73fca0a24274838a`.
**Our fork:** `mahitgovil/22_a2` (original commit history kept; our changes are new commits on top).

## What worked

We ran every Part A script on a clean PostgreSQL 16 database and seeded it with the provided seeder. Everything below worked as described in their README:

- `01`–`05` SQL scripts run in order with no errors (schema, CHECK constraints, indexes, trigger, procedure, materialized view).
- The seeder produced 5,000 clients, 10,000 freelancers, 50,000 contracts and 100,000 audit rows in about 35 seconds.
- `sp_execute_gig_funding` debits the client, inserts a `FUNDED` contract, and the trigger writes exactly one `wallet_audit_logs` row.
- The partial unique index `idx_active_gig` rejects a second `IN PROGRESS` contract for the same freelancer.
- `refresh_freelancer_lifetime_summary()` refreshes the materialized view (the unique index it needs exists).
- The `$facet` pipeline logic is correct (we checked its stages on sample data).

## What did not work or was hard to use

| # | Problem | Effect on Assignment 2 |
|---|---|---|
| 1 | Mongo scripts started with `use gigtask;`, which is a shell helper and fails inside `load()`ed scripts. | The README's `load("mongo/...")` instructions did not select the database. |
| 2 | `mongo/02_workflow3_geoNear.js` only prints `explain("executionStats")`. It never returns the workers. | The map needs real results, so the API runs the same `$geoNear` stage and returns documents. |
| 3 | README references `02_workflow3_geonear.js` but the file is `02_workflow3_geoNear.js`. | Fails on case-sensitive file systems (Linux, Docker). Fixed in our README. |
| 4 | The Workflow 2 query builds every freelancer × every day (about 3.6 M rows) and takes about 17 s (their own `EXPLAIN ANALYZE`). | Far too slow for a web page. |
| 5 | The materialized view has no "last refreshed" information. PostgreSQL does not store it. | The Analytics screen has to show it. |
| 6 | Nothing can move a contract from `FUNDED` to `IN PROGRESS` to `COMPLETED`. | The partial unique index could not be demonstrated from the UI. |
| 7 | Seeded `WorkerLocations` pings are timestamped within the last 5 minutes and have a 7200 s TTL. | About two hours after seeding the collection is empty, so a demo would show an empty map. |
| 8 | `docs/mongo_schema_map.json` says `freelancer_id` is `long`, the validator says `int`. | Cosmetic. Our new collection accepts both. |
| 9 | There was no flexible catalog collection for GigTask (the assignment expects Portfolios). | Added `Portfolios`. |
| 10 | After a fresh seed the materialized view is empty (nothing refreshes it). | Summary tiles would read zero. |
| 11 | The audit log stores amount, type and balance only, with no link to the contract that caused the change. | Audit screen cannot say *why* money moved. See suggestions. |

## What we changed and why

| File | Change |
|---|---|
| `mongo/01..03_*.js` | `use gigtask` replaced by `db = db.getSiblingDB("gigtask")` (works in `load()` and `mongosh --file`). |
| `mongo/01_collections_and_indexes.js` | Added the `Portfolios` collection (unique index on `freelancer_id`) and an index on `WorkerLocations(freelancer_id, created_at)`. |
| `sql/05_materialized_views.sql` | Added table `mv_refresh_log`; `refresh_freelancer_lifetime_summary()` now records when and how long the refresh took. Function signature is unchanged. |
| `sql/07_contract_lifecycle.sql` (new) | `fn_advance_contract_status()` moves a contract `FUNDED → IN PROGRESS → COMPLETED` only. `sp_execute_gig_funding_and_start()` is the Workflow 1 procedure but inserts the contract as `IN PROGRESS`, so a clash with the partial unique index rolls the debit back. The rule itself is still enforced only by `idx_active_gig`. |
| `sql/08_api_analytics.sql` (new) | `fn_freelancer_moving_average()` and `fn_freelancer_revenue_ranking()`: the same calendar-series, `AVG() OVER (ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` and `DENSE_RANK()` technique, limited to what a screen shows (about 100 ms instead of 17 s). |
| `data_generation/postgres_seeder.py` | Refreshes the materialized view at the end. It was created while the tables were empty, so the Analytics summary showed zeros after a fresh seed. |
| `data_generation/mongo_seeder.py` | Seeds 10,000 `Portfolios` documents with deliberately different shapes. |
| `.gitignore` | Added `node_modules/`, `dist/`, `.env`. |
| `README.md` | Replaced for Assignment 2. |

Part A files `01`–`04` and `06` are unchanged.

## Suggestions for the original authors

1. Add `contract_id` and `reason` to `wallet_audit_logs` so the audit trail can explain each change.
2. Add a freelancer wallet or payout step; at the moment completing a contract pays nobody.
3. Add a procedure for the other lifecycle transitions (we added one) and a CHECK or trigger that forbids illegal jumps.
4. Make `02_workflow3` return results, with `explain` as a separate script.
5. Seed pings with timestamps spread across the last 2 hours, or document the TTL clearly.
6. Keep script names and README references identical, including letter case.
