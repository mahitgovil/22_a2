# GigTask Desk — Assignment 2 (Front End Design)

**Team 22 · Project 5: GigTask** (freelance micro-jobs marketplace)

| Team member | Roll no. |
|---|---|
| Mahit Govil | 2026201062 |
| Aditya Mishra | 2026201014 |
| Samrath Singh | 2026202004 |
| Jatin Sharma | 2026202013 |

Inherited from Team 14's Assignment 1 (`ygd06/14_a1`, commit `af2b0039d80bd9f2ccb15deb73fca0a24274838a`).

GigTask Desk is a web app on top of the inherited PostgreSQL + MongoDB database. It covers all four Assignment 1 workflows plus browsing:

| Screen | What it shows | Database feature behind it |
|---|---|---|
| **Browse** | Contracts, clients, freelancers with search, filters, pagination, detail pages | server-side `LIMIT/OFFSET`, 50,000+ rows never loaded at once |
| **Fund a gig** (Workflow 1) | Balance before/after, new audit entry, friendly errors, status buttons | `sp_execute_gig_funding`, wallet audit trigger, partial unique index `idx_active_gig` |
| **Audit trail** | Read-only wallet log per client, date filter, running balance | `wallet_audit_logs` written by trigger |
| **Analytics** (Workflow 2) | 7-day moving average chart, DENSE_RANK table, summary tiles with “last refreshed” and a refresh button | window functions, materialized view `freelancer_lifetime_summary` |
| **Map** (Workflow 3) | Workers within 5 km of a selectable job site, list sorted by distance, live updates | MongoDB `$geoNear` on a `2dsphere` index |
| **Reviews** (Workflow 4) | Rating distribution, top tags, average, latest reviews, a flexible portfolio document | MongoDB `$facet`, `Portfolios` collection |

Screenshots are in [`docs/screenshots/`](docs/screenshots/). Users, wireframes and look and feel: [`docs/design/user_descriptions.md`](docs/design/user_descriptions.md).

## Run it

You need PostgreSQL 14+, MongoDB 6+, Node 18+ and Python 3.10+. (Or use Docker, below.)

### 1. Databases

```bash
createdb gigtask                      # or: sudo -u postgres createdb gigtask
for f in 01_schema_ddl 02_indexes 03_triggers_and_audit 04_stored_procedures \
         05_materialized_views 07_contract_lifecycle 08_api_analytics; do
  psql -d gigtask -v ON_ERROR_STOP=1 -f sql/$f.sql
done
mongosh --file mongo/01_collections_and_indexes.js
```
(`sql/06_window_analytics.sql` is the original full-platform query; it takes about 17 s and is not needed to run the app.)

### 2. Seed the data

```bash
python3 -m pip install -r data_generation/requirements.txt
export POSTGRES_DSN=postgresql://postgres:postgres@localhost:5432/gigtask   # adjust user/password
export MONGO_URI=mongodb://localhost:27017
python3 data_generation/postgres_seeder.py   # ~35 s: 5k clients, 10k freelancers, 50k contracts, 100k audit rows
python3 data_generation/mongo_seeder.py      # 500k pings, 100k reviews, 10k portfolios
```

### 3. API and web app

```bash
cd web && npm install && npm run build && cd ..      # builds web/dist
cd api && npm install
cp .env.example .env                                 # edit connection strings if needed
npm start                                            # http://localhost:4000 serves API and UI
```

Development mode with hot reload: run `npm start` in `api/`, then `npm run dev` in `web/` and open http://localhost:5173.

> **Live pings:** `WorkerLocations` has a 7200 s TTL, so seeded pings vanish after about two hours. `SIMULATE_PINGS=1` (set in `.env.example`) makes the API insert fresh pings every 5 seconds so the Map is never empty. You can also run `npm run pings` in `api/` on its own, or press “Simulate new pings” on the Map screen.

### Docker alternative

```bash
docker compose up --build                            # Postgres, Mongo and the app on http://localhost:4000
docker compose --profile seed run --rm seed          # load the data (once)
```

### Tests

```bash
cd api && npm test
```
Five tests against the seeded PostgreSQL database cover Workflow 1: successful funding (balance, contract and trigger-written audit row), insufficient balance, the one-active-contract rule with rollback, invalid inputs/transitions, and a consistent running balance in the audit trail.

## Project layout

```
22_a2/
├── README.md
├── docs/            handover_note.md, api_endpoints.md, design/ (user_descriptions.md, wireframes/), screenshots/, relational_erd.png, mongo_schema_map.json
├── sql/             Part A scripts 01–06 + our 07 (lifecycle) and 08 (analytics functions)
├── mongo/           Part A scripts + Portfolios collection
├── performance/     Part A performance work
├── data_generation/ seeders (Postgres, Mongo)
├── api/             Express server (src/routes, src/db), tests
├── web/             React + Vite app (src/screens, src/components)
├── docker/          init script for the Postgres container
├── Dockerfile
└── docker-compose.yml
```

## Tech choices

| Choice | Why |
|---|---|
| **Express + `pg` + `mongodb`** | Smallest possible API. Money rules, audit, ranking and geo queries stay in the database; the API only calls them and translates errors. |
| **React + Vite + React Router** | Six screens with shared pieces (tables, pagers, pickers). Vite builds to static files the API can serve from one port. |
| **Chart.js** | Line and bar charts with accessible text alternatives and no extra dependencies. |
| **Leaflet + OpenStreetMap tiles** | Free map, no API key. Markers are drawn as vector circles, so no image assets. |
| **Plain CSS** | One small stylesheet with colour tokens; no UI framework to learn for the viva. |

## Assumptions

All Part A assumptions still hold (see the Assignment 1 repository linked above). Added for this assignment:

1. Currency is Indian rupees (₹) and is formatted only in the browser.
2. “Acting as” a client is a demo switcher, not a login. The selected client is remembered in the browser.
3. A contract moves only `FUNDED → IN PROGRESS → COMPLETED`. Completing a contract does not pay the freelancer (there is no freelancer wallet in Part A); it only counts toward earnings.
4. The Map shows each freelancer once, at their nearest ping inside 5 km, and polls every 4 seconds.
5. Analytics summary tiles read only from the materialized view, so they are stale until “Refresh data” is pressed. Charts and the ranking read live data.
6. The Audit trail's running balance is the `balance_after` the trigger stored, shown with the balance before each change.
7. The map needs internet access for the OpenStreetMap tiles.
8. Reviews and Portfolios depend on MongoDB; if it is down those panels show an error with a retry button and the PostgreSQL screens keep working.

## Changes to the inherited database scripts

Full reasoning is in [`docs/handover_note.md`](docs/handover_note.md). In short: Mongo scripts use `getSiblingDB` instead of `use`; new `Portfolios` collection; `mv_refresh_log` table and an updated refresh function; new `sql/07_contract_lifecycle.sql` and `sql/08_api_analytics.sql`; the Postgres seeder refreshes the materialized view; the Mongo seeder adds portfolios.

## Submission details

- **GitHub repository:** https://github.com/mahitgovil/22_a2
- **Final commit hash:** 45d3225c6ae88ab9ee253268400d66c4c7c21a10
- **Demo video (≤ 5 min):** https://tinyurl.com/msbhmfuz

### Contributions

Each member owns one feature area, from the database to the screen. Part A files (`sql/01`–`04`, `06`, `performance/`, the ERD) are Team 14's work.

| Member | Area | Design | Code |
|---|---|---|---|
| Mahit Govil (2026201062) | Workflow 1: funding, contract lifecycle, wallet audit | Task flows "Client hires someone" and "Client checks their money"; Fund a gig and Audit trail wireframes; error and empty-state wording | `sql/07_contract_lifecycle.sql`; `api/src/routes/transactions.js` (fund, status change, audit); `api/src/errors.js`; `Fund.jsx`, `Audit.jsx`, `StatusMover.jsx`; `api/test/transaction.test.js` |
| Aditya Mishra (2026201014) | Browse, app shell, design system | User personas; shared desktop and phone layout; colour tokens, type, status badges, reusable components, accessibility rules; Browse and detail-page wireframes | `api/src/routes/browse.js` (paginated lists, detail pages); `app.js`, `server.js`, `db/pg.js`; `App.jsx`, `main.jsx`, `api.js`, `hooks.js`, `format.js`, `actor.jsx`; `components/ui.jsx`, `styles.css`, Vite setup; `docs/api_endpoints.md` |
| Samrath Singh (2026202004) | Workflow 2: analytics and materialized view, deployment | Task flow "Manager checks performance"; Analytics wireframe (summary tiles with last refreshed, moving-average chart, ranking); chart text alternatives | `sql/08_api_analytics.sql`; `mv_refresh_log` and logged refresh in `sql/05`; seeder refreshes the view; `api/src/routes/analytics.js`; `Analytics.jsx`, `components/charts.jsx`; `Dockerfile`, `docker-compose.yml`, `docker/init-postgres.sh` |
| Jatin Sharma (2026202013) | Workflows 3 and 4: MongoDB map, reviews, portfolios, handover | Task flow "Anyone checks quality"; Map and Reviews wireframes; free-form portfolio document shape | `mongo/` script fixes, `Portfolios` collection and new index; portfolios in `mongo_seeder.py`; `api/src/routes/mongoRoutes.js` (`$geoNear`, `$facet`, portfolios); `db/mongo.js`, `pings.js`, `scripts/pings.js`; `MapScreen.jsx`, `Reviews.jsx`; `docs/handover_note.md` |


