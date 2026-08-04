import { auctions } from "@shared/schema";
import { sql } from "drizzle-orm";

/**
 * Auction lifecycle status — the single definition of "retired".
 *
 * This lives in its own leaf module (schema + drizzle only, no service imports)
 * because the files that need it form a cycle otherwise:
 * auctionArchiver -> auctionScraper -> enrichmentQueue -> auctionEnrichment.
 * Anything imported from here is safe to pull into any of them.
 */

/**
 * Set by the archiver instead of deleting the row. See auctionArchiver.ts.
 *
 * `auctions.status` is a plain text column with no CHECK constraint, so this
 * needed no migration — but it also means nothing at the database level stops a
 * query from forgetting about it.
 */
export const ARCHIVED_STATUS = "archived";

/**
 * "This row has not been retired."
 *
 * Every read of `auctions` that is about live listings must carry this. Until
 * archiving became reversible, retired rows were physically deleted, so an
 * unfiltered query was correct by accident; now it sweeps the entire archive —
 * roughly 700-1,500 rows per night, which overtakes the ~1,400 live rows inside
 * a week.
 *
 * `status` is NULLABLE. A bare `status <> 'archived'` evaluates to NULL for
 * those rows and silently drops them, so the IS NULL arm is load-bearing rather
 * than defensive.
 */
export const NOT_ARCHIVED = sql`(${auctions.status} IS NULL OR ${auctions.status} <> ${ARCHIVED_STATUS})`;
