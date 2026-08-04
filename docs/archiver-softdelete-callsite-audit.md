# Call-site audit — `auctions` reads after archiving became reversible

> 2026-08-03. Companion to the change in `server/services/auctionArchiver.ts`.
> Archiving now sets `status = 'archived'` instead of `DELETE`.

## Why this audit exists

Retired rows used to be **physically absent** from `auctions`. Every query that
did not filter on status therefore returned the right answer by accident. Those
rows now stay in the table, so any unfiltered read silently gains them.

**Volume:** the table holds 1,447 live rows today and the archiver retires
roughly 700–1,500 rows per night (763 on 2026-08-03, 779 on 08-01, 798 on 07-30,
1,565 on 07-31). Within about a week, unfiltered reads will be returning more
archived rows than live ones. This is not a slow-burn issue.

**Nothing reads `archived_auctions`.** It is write-only across the whole repo —
purely an audit trail — so no consumer breaks from the table's new duplication.

## Legend

| Verdict | Meaning |
|---|---|
| ✅ SAFE | Already filters `status = 'active'`. No change needed. |
| ⚠️ FIX | Returns/acts on archived rows. Needs an explicit predicate. |
| 🔴 BREAKS | Logic depends on the row *disappearing*. Wrong after this change. |
| 🟡 OK-BY-ID | Single-row lookup by primary key. Deep links keep working; consider surfacing `status` to the client. |

The predicate to add, unless noted otherwise — now exported so there is one
definition rather than a copy per file:

```ts
import { NOT_ARCHIVED } from "./services/auctionStatus.js";
// = sql`(${auctions.status} IS NULL OR ${auctions.status} <> 'archived')`
```

It lives in `server/services/auctionStatus.ts`, a leaf module importing only
`@shared/schema` and `drizzle-orm`, because the files that need it would
otherwise close an import cycle
(`auctionArchiver → auctionScraper → enrichmentQueue → auctionEnrichment`).
`auctionArchiver.ts` re-exports `ARCHIVED_STATUS` and `NOT_ARCHIVED` so existing
importers keep working. It composes into raw `sql` templates too — see the
`source-stats` query in `server/routes.ts` for `COUNT(*) FILTER (WHERE ${NOT_ARCHIVED})`.

`status` is nullable, so a bare `<> 'archived'` evaluates to NULL for those rows
and silently drops them. Demonstrated over `VALUES('active','sold','archived',NULL)`:
the `IS NULL OR` form keeps 3, the bare form keeps 2. There are 0 NULL-status rows
today, so this is a latent trap rather than a live one — but the column has no
NOT NULL constraint.

## Status of this audit

Everything in `server/services/**`, `server/routes.ts` and `scripts/**` below is
**FIXED**. `worker/src/routes/api.ts` is being handled separately by its owner.
Verified with `scripts/verify-archived-exclusion.ts` (read-only; simulates the
post-ship table by UNIONing the 93,068 `archived_auctions` rows into `auctions`
as `status='archived'`).

---

## worker/src/routes/api.ts — production Cloudflare Worker

| Line | Call site | Verdict | Note / exact fix |
|---|---|---|---|
| 381 | `POST /auctions/validate-counties` | ⚠️ FIX | `where: sql\`latitude IS NOT NULL AND longitude IS NOT NULL\`` → append `AND (status IS NULL OR status <> 'archived')`. Otherwise every archived row gets a **paid reverse-geocode call** on each run. |
| 434 | `GET /auctions/needs-review` | ⚠️ FIX | `eq(auctions.needsDateReview, true)` — wrap in `and(...)` with the predicate. Archived rows would otherwise flood the human date-review queue. |
| 491 | `GET /auctions/source-stats` | ⚠️ FIX | Raw SQL. `COUNT(*) AS total_auctions` and `MAX(scraped_at)` are unfiltered and will inflate. Add `WHERE (status IS NULL OR status <> 'archived')`, or add `COUNT(*) FILTER (WHERE status = 'archived') AS archived_count` and leave the total honest. |
| 946 | `GET /auctions/all` | ⚠️ FIX | `orderBy scrapedAt desc, limit 500`, no filter. Since archived rows keep their `scraped_at`, and the scraper re-touches them, this admin view fills with retired listings. Add the predicate. |
| **1002** | `GET /auctions` (the map) | ✅ SAFE | `conditions[0] = eq(auctions.status, "active")`. |
| **1099** | `GET /auctions/count` | ✅ SAFE | Same first condition. |
| 1194 | diagnostics attribution SQL | ✅ SAFE | `WHERE status = 'active'`. |
| 1256, 1259 | `POST /auctions/archive-non-farm` | 🔴 **BREAKS** | Computes `archived = totalBefore - totalAfter` from two unfiltered `findMany()` calls. Row count no longer changes, so this endpoint will **always report 0 archived** while quietly retiring hundreds. Replace both counts with `SELECT count(*) FROM auctions WHERE status = 'active'`, or return `retired` from the archiver directly. |
| 1304 | `GET /auctions/enrichment-errors` | ⚠️ FIX | Minor: archived rows appear in the error list. Add the predicate. |
| **1354** | `POST /auctions/retry-failed-enrichments` | ⚠️ **FIX (cost)** | `UPDATE auctions SET enrichment_status='pending' WHERE enrichment_status='failed'` — no status filter, then immediately runs `enrichAllPendingAuctions`. Every archived row with a failed enrichment gets **re-sent to GPT-4o**. Add `and(eq(...,'failed'), sql\`(status IS NULL OR status <> 'archived')\`)`. Highest-cost item in this table. |
| 1418, 1423 | blocklist add | 🟡 OK-BY-ID | Looks up by URL then hard-deletes. Deliberate and still correct; a blocklisted URL should leave the table entirely. |
| **1463** | `GET /auctions/upcoming` | ✅ SAFE | `eq(auctions.status, "active")`. |
| 1501 | `GET /auctions/:id` | 🟡 OK-BY-ID | Returns archived rows. Fine for deep links; the client should be able to see `status` so it can badge them. |
| 1571 | `POST /auctions/:id/prepare-valuation` | 🟡 OK-BY-ID | Same. |
| 2097 | `GET /auctions/diagnostics/recent-acquisitions` | ⚠️ FIX | Unfiltered `orderBy scrapedAt desc`. |
| 2110 | `GET /auctions/diagnostics/upcoming` | ⚠️ FIX | `where: sql\`auction_date::date >= CURRENT_DATE\`` only. An archived-but-future-dated row — exactly the false-positive class this whole effort is about — shows up here labelled "upcoming". |
| 2125–2160 | `GET /auctions/investigate` | ⚠️ FIX | Five unfiltered aggregates (`totalCount`, `withCoords`, `withoutCoords`, `noCoordButHasCounty`, `bySource`). All inflate; the coverage percentages become meaningless. |
| 2192–2205 | `POST /auctions/update-coordinates` | ⚠️ FIX (cost) | Selects every row missing coordinates and geocodes it. Archived rows get geocoded forever. |

## server/routes.ts — Railway Node process (parallel run) — **ALL FIXED**

Near-mirror of the Worker. Line numbers are post-fix.

| Line | Call site | Was | Now |
|---|---|---|---|
| 356 | `validate-counties` | ⚠️ paid geocode | `and(coords, NOT_ARCHIVED)` |
| 417 | `needs-review` | ⚠️ | `and(needsDateReview, NOT_ARCHIVED)` |
| 484–501 | `source-stats` | ⚠️ | every existing column now `FILTER (WHERE … NOT_ARCHIVED)` so each keeps the meaning it had pre-soft-delete; new `archived_count` reported alongside rather than folded into the totals |
| 981 | `/api/auctions/all` | ⚠️ | `where: NOT_ARCHIVED` |
| ~1030 | `/api/auctions` (map) | ✅ SAFE | unchanged — `eq(auctions.status, 'active')` |
| ~1143 | `/api/auctions/count` | ✅ SAFE | unchanged |
| 1282–1294 | `archive-non-farm` | 🔴 BREAKS | counts live rows on both sides via a `countLive()` helper instead of subtracting total row counts |
| 1341 | `enrichment-errors` | ⚠️ | `and(failed, NOT_ARCHIVED)` |
| 1396–1404 | `retry-failed-enrichments` | ⚠️ cost | `.where(and(failed, NOT_ARCHIVED))` |
| — | blocklist add | 🟡 OK-BY-ID | unchanged, deliberate hard delete |
| — | `/api/auctions/:id`, valuation | 🟡 OK-BY-ID | unchanged |
| 2188 | `diagnostics/recent-acquisitions` | ⚠️ | `where: NOT_ARCHIVED` |
| 2213 | `diagnostics/upcoming` | ⚠️ | `and(future, NOT_ARCHIVED)` |
| 2236–2272 | `investigate` (5 aggregates) | ⚠️ | all scoped to `NOT_ARCHIVED` |
| 2311 | `update-coordinates` | ⚠️ cost | `and(noCoords, NOT_ARCHIVED)` |

> **Still open, and not mine:** `server/routes.ts` around line 1058 never got the
> map fix the Worker did — `limit: 200`, `orderBy asc(auctionDate)`, no
> `auction_date >= CURRENT_DATE`, bbox applied in JS after the limit. Untouched
> here because it is a separate defect from soft-delete, but during the parallel
> run Railway serves a map that cannot show a single upcoming auction.

> **Separate, pre-existing:** `server/routes.ts:1052` still has the old map query —
> `limit: 200`, `orderBy asc(auctionDate)`, no `auction_date >= CURRENT_DATE`, and
> the bounding box applied in JS *after* the limit. The Worker copy was fixed
> (`worker/src/routes/api.ts:1017-1030`); this one was not. During the parallel
> run, Railway serves a map that cannot show a single upcoming auction.

## server/services

| File:line | Call site | Status |
|---|---|---|
| `auctionEnrichment.ts:332` | `enrichAll()` | **FIXED** — `and(pending, NOT_ARCHIVED)` |
| `auctionEnrichment.ts:359-364` | `reEnrichAll()` — the `UPDATE` had **no WHERE at all** | **FIXED** — both the select and the reset are `.where(NOT_ARCHIVED)` |
| `auctionEnrichment.ts:390` | `getEnrichmentStats()` | **FIXED** — `where: NOT_ARCHIVED` (its `pendingIds` is fed straight back into `enrichBatch` by callers) |
| `enrichmentQueue.ts:268` | `enrichAllPendingAuctions()` | **FIXED** — `and(pending, NOT_ARCHIVED)` |
| `enrichmentQueue.ts:307-315` | `reEnrichAllAuctions()` — same unscoped reset | **FIXED** — both scoped |
| `auctionScraper.ts:857` | `calculateValuation(id)` | ✅ SAFE (by id) |
| **`auctionScraper.ts:824-830`** | `saveAuction()` upsert | ⚠️ **owner's file** — see below |

### The upsert resurrection problem

`onConflictDoUpdate({ target: auctions.url, set: { ..., status: auctionStatus } })`.
Because a retired row now keeps its URL, the nightly scrape finds it, conflicts,
and **flips it straight back to `'active'`**. A listing that sits on an
auctioneer's site forever will bounce active → archived → active indefinitely.

This churn already existed under hard-delete (delete → re-insert → re-delete;
it is why 2,100 auctions produced 92,389 archive rows), and the archiver's new
audit de-duplication stops the archive-table bloat. But the flapping is worth
closing at the source. Suggested change at `server/services/auctionScraper.ts:830`:

```ts
// Don't resurrect a row the archiver retired unless this scrape actually
// found it a future sale date. Otherwise a stale listing that never comes
// down flaps active/archived every night.
status: sql`CASE
  WHEN ${auctions.status} = 'archived'
   AND ${auctionDate}::timestamp IS NOT NULL
   AND ${auctionDate}::timestamp >= CURRENT_DATE
  THEN ${auctionStatus}
  WHEN ${auctions.status} = 'archived' THEN 'archived'
  ELSE ${auctionStatus}
END`,
```

Deliberately still allows resurrection — a genuinely relisted farm with a new
future date must come back. It only refuses to un-retire rows that gained no new
date.

## scripts/ — developer tools, lower priority

Unfiltered reads that will now sweep archived rows. None run automatically.

| File:line | Effect |
|---|---|
| `classify-auctions.ts:29` | `db.select().from(auctions)` — reclassifies the whole archive |
| `backfill-auction-csr2.ts:17` | spends CSR2/soil lookups on retired rows |
| `backfill-auction-dates.ts:20` | AI date extraction on retired rows |
| `geocode-missing-auctions.ts:47`, `retry-failed-geocoding.ts:26,88`, `manual-geocode-three.ts:115`, `test-geocoding-sample.ts:30` | paid geocoding on retired rows |
| `find-sold-auctions.ts:14`, `mark-sold-auctions.ts:18` | unfiltered scans |
| `reset-stuck-enrichments.ts:15`, `reprocess-auctions.ts:44` | re-queue retired rows for enrichment |
| `check-enrichment-status.ts:23,79,107`, `audit-auction-coverage.ts:106`, `view-recent-auctions.ts:17`, `analyze-auction-geocoding.ts`, `verify-*.ts` | reporting only — numbers inflate |
| ~~`archive-past-auctions.ts`, `archive-non-farm-auctions.ts`, `archive-nonfarm-and-past.ts`~~ | **DELETED.** All three hard-DELETEd and each carried its own drifted copy of the non-farm rules — `archive-non-farm-auctions.ts` matched `'estate auction'`, bare `'gun'` and `'vehicle'` against the **description** as well as the title, a broader form of the bug that removed thousands of real estate auctions. Replaced by `scripts/archive-auctions.ts`, which calls the one implementation in `auctionArchiver.ts`. Their `--dry-run` flag was preserved as `archivePastAuctions({ dryRun })`. |
