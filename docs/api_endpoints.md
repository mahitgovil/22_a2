# API endpoints

Base URL `http://localhost:4000/api`. JSON in, JSON out. The API is deliberately thin: money rules, the audit trail, the one-active-contract rule, ranking and moving averages all live in the database (procedures, trigger, partial index, window-function queries, aggregation pipelines).

Errors always look like `{ "error": { "code": "...", "message": "friendly text", "detail": "raw db message" } }`.
Paged lists accept `page` (default 1) and `pageSize` (default 20, max 100) and return `{ items, total, page, pageSize }`.

## Health
| Method & path | Returns |
|---|---|
| `GET /health` | `{ postgres: "up"\|"down", mongo: "up"\|"down" }` |

## Browse (PostgreSQL; freelancer detail also reads MongoDB)
| Method & path | Inputs | Returns |
|---|---|---|
| `GET /clients` | `q` (name or id), paging | page of `{ id, name, escrow_balance }` |
| `GET /clients/:id` | | client + `stats` (counts by status, total committed) + 10 latest contracts |
| `GET /freelancers` | `q`, `available=true\|false`, paging | page of freelancers |
| `GET /freelancers/:id` | | freelancer + lifetime earnings (from the materialized view) + 10 latest contracts + `portfolio` (MongoDB; `portfolioError` if Mongo is down) |
| `GET /contracts` | `id`, `status`, `clientId`, `freelancerId`, paging | page of contracts with client and freelancer names |
| `GET /contracts/:id` | | one contract |

## Workflow 1: transaction
| Method & path | Inputs | Returns |
|---|---|---|
| `POST /contracts/fund` | body `{ clientId, freelancerId, budget, startNow? }` | `201 { procedure, balanceBefore, balanceAfter, contract, auditEntries[] }` |
| | | `400 INSUFFICIENT_BALANCE` (raised by the procedure), `409 FREELANCER_BUSY` (partial unique index `idx_active_gig`; debit is rolled back), `404 NOT_FOUND`, `400 INVALID_BUDGET`. Failure bodies include `balanceAfterFailure`. |
| `PATCH /contracts/:id/status` | body `{ status: "IN PROGRESS" \| "COMPLETED" }` | updated contract; `409 FREELANCER_BUSY` if it would be a second active contract; `400 INVALID_TRANSITION` |

`startNow=false` calls `sp_execute_gig_funding` (Part A). `startNow=true` calls `sp_execute_gig_funding_and_start`.

## Audit trail (read-only)
| Method & path | Inputs | Returns |
|---|---|---|
| `GET /clients/:id/audit` | `from`, `to` (YYYY-MM-DD), paging (max 200) | `{ client, summary{ total, total_credits, total_debits, opening_balance, closing_balance }, items[{ id, created_at, action_type, amount_changed, signed_change, running_balance, balance_before }] }` newest first |

## Workflow 2: analytics (window functions + materialized view)
| Method & path | Inputs | Returns |
|---|---|---|
| `GET /analytics/moving-average` | `freelancerId?` (omit = platform), `days` (7–730, default 90) | `{ freelancer, days, points[{ day, revenue, revenue_7_day_moving_avg }] }` |
| `GET /analytics/ranking` | paging | `items[{ revenue_rank (DENSE_RANK), freelancer_id, name, completed_contracts, lifetime_revenue }]` |
| `GET /analytics/summary` | | totals read only from `freelancer_lifetime_summary`, `topEarners[]`, `lastRefreshed`, `lastRefreshDurationMs` |
| `POST /analytics/refresh` | | refreshes the materialized view; returns `{ lastRefreshed, lastRefreshDurationMs }` |

## Workflow 3: map (MongoDB `$geoNear`)
| Method & path | Inputs | Returns |
|---|---|---|
| `GET /map/nearby` | `lng`, `lat`, `radius` (default 5000 m), `limit`, `availableOnly` (default true) | `{ origin, radius, count, queryMs, serverTime, workers[{ freelancer_id, name, distanceMeters, is_available, location, created_at, pingId }] }` sorted by distance, one (nearest) ping per freelancer |
| `POST /map/pings` | body `{ lng, lat, count? }` | `201 { inserted }` demo helper: adds new pings near a point |

The browser polls `/map/nearby` every 4 seconds, so new pings appear without a reload.

## Workflow 4: reviews (MongoDB `$facet`)
| Method & path | Inputs | Returns |
|---|---|---|
| `GET /reviews/analytics` | `freelancerId?` | `{ rating_distribution[{ rating, count }], top_skill_tags[{ tag, count }], average_rating, review_count }` |
| `GET /reviews` | `freelancerId?`, paging (max 50) | latest reviews |
| `GET /portfolios/:freelancerId` | | the flexible portfolio document (404 if none) |

## Status codes used
`200/201` success · `400` bad input or a business rule · `404` not found · `409` one-active-contract rule · `503` PostgreSQL or MongoDB not reachable · `500` anything unexpected.
