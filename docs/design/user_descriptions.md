# Design: GigTask Desk

This document describes who uses GigTask Desk, what they do with it, how each screen is laid out and how the app looks and reads. It matches the built application. Screenshots of the finished screens are in [`../screenshots/`](../screenshots/) and the original wireframes are in [`wireframes/`](wireframes/).

## 1. Who uses it

| User | Goal | Screens they use |
|---|---|---|
| **Client** (a person or small business who hires freelancers) | Put money in escrow for a gig, see where their money went, find a freelancer who is nearby, check reviews and portfolios before hiring, move their contracts along | Browse, Fund a gig, Audit trail, Map, Reviews |
| **Platform manager** (runs the marketplace) | See how earnings are trending, who the top freelancers are, whether reviews are healthy, look up any contract, client or freelancer | Analytics, Reviews, Browse, Fund a gig (status buttons) |

The top-bar switcher (“Acting as client”) lets a demo move between clients and shows each client's current escrow balance. There is no login; the chosen client is remembered in the browser.

### What each user wants to do (task flows)

1. **Client hires someone:** Browse or Map → open a freelancer's profile → “Fund a gig for this freelancer” → Fund a gig → see balance before and after and the audit entry written by the trigger → later, press *Start work* and *Mark completed* on the contract.
2. **Client checks their money:** Audit trail → optional From/To dates → start balance, money in, money out, end balance → running-balance chart and entry table.
3. **Manager checks performance:** Analytics → read the summary tiles and their “last refreshed” time → press *Refresh data* if needed → pick the whole platform or one freelancer and a period → read the 7-day average → scan the revenue ranking.
4. **Anyone checks quality:** Reviews → rating distribution and popular skills (all freelancers or one) → latest reviews → a freelancer's portfolio.
5. **Client finds someone nearby:** Map → pick a job site (or click the map) → closest available workers first → open a profile.

### When things go wrong

| Situation | What the user sees |
|---|---|
| Budget is higher than the escrow balance | “Gig not funded” panel with a plain-language reason, balance before and after unchanged, and “nothing was charged” |
| Freelancer already has a contract in progress | Same panel with the reason that a freelancer can only work on one active gig at a time; the whole request is rolled back, so there is no new contract and no audit entry. A reason code (for example `FREELANCER_BUSY`) is shown for the technical reader |
| Invalid input or an illegal status jump | Short message naming the field or rule; nothing is changed |
| MongoDB is down | Reviews, portfolios and the Map show an error with a retry button; the PostgreSQL screens keep working |
| Nothing to show | Empty state that says what to do next |

## 2. Screens and wireframes

Layout shared by every screen: dark sidebar (menu) on the left, top bar with the screen title and the client switcher, content cards on the right. Below 760 px wide the sidebar becomes a bottom tab bar, the switcher goes full width and tables turn into stacked cards. Below 980 px two-column screens stack into one column.

```
Desktop                                          Phone
+---------+--------------------------------+    +--------------------------+
| GigTask |  Screen title     Acting as ▾  |    | Screen title             |
| Browse  +--------------------------------+    | [ Acting as client  ▾ ]  |
| Fund    |  [card]                        |    | [card]                   |
| Audit   |  [card]                        |    | [card]                   |
| Analyt. |  [card]                        |    |                          |
| Map     |                                |    +--------------------------+
| Reviews |                                |    | Browse Fund Audit … Map  |
+---------+--------------------------------+    +--------------------------+
```

### Browse
```
[Contracts | Clients | Freelancers]
[ search ] [ status v ]          (freelancers: availability filter)
| Contract | Client | Freelancer | Budget | Status | Created |
|  …15 rows per page…                                         |
1–15 of 50,008          « Previous  Page 1 of 3,334  Next
```
The search box takes a contract number for contracts and a name or number for clients and freelancers. Filters and page live in the address, so a view can be shared or reloaded. Rows link to detail pages:
- **Contract:** client, freelancer, budget, status and the same status button as Fund a gig.
- **Client:** escrow balance, contract counts by status, total committed, latest contracts, link to their audit trail.
- **Freelancer:** availability, lifetime earnings (from the materialized view), completed contracts, home location, portfolio (headline, skills, rates, projects, links, raw MongoDB document), latest contracts, and “Fund a gig for this freelancer”.

### Fund a gig (Workflow 1)
```
+-- Fund a gig --------------------+  +-- Gig funded / Gig not funded ----+
| Freelancer [search…]             |  | Balance before | Balance after    |
| Budget (₹) [ 250 ]               |  | Contract #… created (funded)      |
| [ ] Start work right away        |  | Audit entry written by the        |
| [Fund gig]                       |  |   database trigger (entry, type,  |
| ▸ Demo shortcuts                 |  |   amount, balance after, when)    |
+----------------------------------+  |  Procedure used: …                |
+-- Latest contracts for this client -+ |  (or the plain-language error,    |
| #  Freelancer  Budget  Status  Next |  |   reason code, “rolled back”)     |
| [Start work / Mark completed]       |  +-----------------------------------+
```
- “Start work right away” creates the contract as in progress instead of funded.
- *Demo shortcuts* fill the form for the two failure cases: “Ask for more than the balance” and “Hire a freelancer who is already working”.
- The latest-contracts list (six rows) moves a contract one step at a time: funded → in progress → completed. Starting two contracts for the same freelancer shows the one-active-contract rule.
- A freelancer link from Browse pre-fills the picker.

### Audit trail
```
[From date] [To date]
[Balance at start] [Money in] [Money out] [Balance at end]  (current balance)
[ running balance line chart for this page ]
N entries for <client>
| Entry | When | Type (Debit / Credit) | Change | Running balance |   pager (20 per page)
```
Read-only: every row was written by the database trigger. Money out is red with a minus sign, money in is green with a plus sign. An end date before the start date is refused with a message.

### Analytics (Workflow 2 + materialized view)
```
Lifetime earnings summary            [Refresh data]
 Last refreshed 15 Oct 2026, 02:20:43 pm (took 95 ms)
 [Total earned] [Freelancers who have earned] [Average per freelancer] [Highest earner]
Revenue and 7-day moving average  [freelancer v] [period v]
 [ line chart: daily revenue + 7-day average ]
Freelancer revenue ranking (DENSE_RANK)
 | Rank | Freelancer | Completed | Lifetime revenue |  pager (10 per page)
```
The summary tiles read only the stored summary, so they are stale until *Refresh data* is pressed and say so. The chart and ranking read live data. Freelancers with the same revenue share a rank.

### Map (Workflow 3)
```
+-- Nearest workers to the job site -+  +-- Closest first [Simulate new pings] -+
| [Job site v] [x] Available only    |  | 60 workers within 5 km · updated …    |
| [x] Update live              ● Live|  | Kimberly Whitaker           34 m      |
| +------------------------------+   |  | Available · pinged … · profile        |
| |  map, 5 km circle, markers   |   |  | …                                     |
| +------------------------------+   |  +---------------------------------------+
| ● Available ● Unavailable ● Job site|
```
The job site is one of six Bengaluru places (MG Road, Koramangala, Indiranagar, Whitefield, Hebbal, Jayanagar) or any point clicked on the map. Each worker appears once, at their nearest ping inside 5 km. With *Update live* on, the list refreshes every few seconds. The map needs internet access for the map tiles.

### Reviews (Workflow 4 + flexible catalog)
```
[Show reviews for v]
[Average rating] [Reviews] [Most mentioned skill]
[ rating distribution bars ]   [ top skill tags bars ]
Latest reviews (stars, freelancer, date, comment, tags)     pager (6 per page)
Freelancer portfolio (free-form document): [Portfolio of v]
 headline, skills, experience, rates by skill, projects, links  ▸ raw MongoDB document
```
Portfolios are free-form, so different freelancers show different sections.

## 3. Screenshots

| Screen | Screenshot files |
|---|---|
| Browse | `browse-contracts-list`, `browse-contracts-browser-window`, `browse-freelancer-profile`, `browse-freelancer-profile-projects-contracts` |
| Fund a gig | `fund-gig-success`, `fund-gig-rejected-freelancer-busy`, `fund-gig-latest-contracts` |
| Audit trail | `audit-trail-balance-chart`, `audit-trail-entries` |
| Analytics | `analytics-earnings-summary-revenue-chart`, `analytics-revenue-ranking` |
| Map | `map-nearest-workers` |
| Reviews | `reviews-analytics-charts`, `reviews-latest-reviews`, `reviews-freelancer-portfolio` |

## 4. Look and feel

- **Idea:** a back-office desk for money. Calm cool-grey paper, white cards, one strong blue for actions.
- **Colours:** ink `#17233B`, paper `#EEF1F5`, card white, brand blue `#2342E6`, sidebar navy `#121C30`. Contract states use colour *and* a word: funded (blue), in progress (amber), completed (green). Money in is green, money out and errors are red (errors on a pale red panel).
- **Type:** Schibsted Grotesk throughout. Numbers use tabular figures so money lines up. Money is shown in rupees (₹) with Indian digit grouping. Sentence case everywhere.
- **Reusable pieces:** card, stat tile, table with pager, status badge, search-as-you-type picker, notice (error), empty state, loading skeleton, button (primary / small).
- **Writing:** buttons name the action (“Fund gig”, “Start work”, “Refresh data”). Errors say what happened and what it means (“nothing was charged”). Empty states say what to do next.
- **Quality floor:** visible keyboard focus, labels on every input, charts have text alternatives, reduced-motion respected, usable from 360 px wide.
