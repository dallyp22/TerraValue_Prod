/**
 * Unit-style tests for the date parser's plausibility window.
 *
 * Run: npx tsx scripts/test-date-extractor.ts
 *
 * The strings below are the real shapes Firecrawl hands back from auction sale
 * bills. The yearless ones are the expensive case: V8 fills the missing year
 * with 2001, so they used to parse "successfully" into a date two decades in the
 * past, sort to the front of the map's `auction_date ASC` window, and then get
 * deleted by the archiver as an expired auction.
 */
// dateExtractor constructs an OpenAI client at import time, so the env has to
// be loaded before the module graph is pulled in. None of these tests call it.
import 'dotenv/config';
import { DateExtractorService, isPlausibleAuctionDate } from '../server/services/dateExtractor.js';

const svc = new DateExtractorService();
const parse = (s: string) => svc.parseFlexibleDate(s);

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}\n      expected: ${expected}\n      actual:   ${actual}`);
  }
}

const iso = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));

const now = new Date();
const thisYear = now.getFullYear();

console.log('\nREJECTED — yearless strings that V8 silently dates to 2001');
// These are the regressions. Every one of them parsed clean before the fix.
for (const s of ['April 24', 'Thursday, April 24', 'Sept 9', 'Sep 9', '1/2']) {
  check(`${JSON.stringify(s)} -> null`, iso(parse(s)), null);
}

console.log('\nREJECTED — junk that was never a date');
for (const s of ['', '   ', 'TBD', 'Auction', 'March', '8:00 a.m.', 'Call for details']) {
  check(`${JSON.stringify(s)} -> null`, iso(parse(s)), null);
}

console.log('\nREJECTED — real dates outside the -1y..+2y auction window');
// 1955-01-15 is not hypothetical: it was live on the map, served to users.
for (const s of ['1955-01-15', '2011-12-28', '2018-08-29', '2099-01-01']) {
  check(`${JSON.stringify(s)} -> null`, iso(parse(s)), null);
}

console.log('\nACCEPTED — well-formed dates inside the window');
check('"2026-08-29" -> 2026-08-29', iso(parse('2026-08-29')), '2026-08-29');
check('"08/29/2026" -> 2026-08-29', iso(parse('08/29/2026')), '2026-08-29');
check('"August 29, 2026" -> 2026-08-29', iso(parse('August 29, 2026')), '2026-08-29');
check('"Sept 9, 2026" -> 2026-09-09', iso(parse('Sept 9, 2026')), '2026-09-09');
// DD-MM-YYYY: day > 12 disambiguates it as European.
check('"29-08-2026" -> 2026-08-29', iso(parse('29-08-2026')), '2026-08-29');

console.log('\nACCEPTED — relative to today, so these keep passing next year');
const soon = new Date(thisYear, now.getMonth(), now.getDate() + 30);
check(
  `today+30d (${iso(soon)}) accepted`,
  iso(parse(iso(soon)!)),
  iso(soon),
);

console.log('\nBOUNDARIES of isPlausibleAuctionDate');
const ref = new Date(2026, 7, 3); // 2026-08-03
check('exactly -1y is inside', isPlausibleAuctionDate(new Date(2025, 7, 3), ref), true);
check('one day before -1y is outside', isPlausibleAuctionDate(new Date(2025, 7, 2), ref), false);
check('exactly +2y is inside', isPlausibleAuctionDate(new Date(2028, 7, 3), ref), true);
check('one day past +2y is outside', isPlausibleAuctionDate(new Date(2028, 7, 4), ref), false);
check('Invalid Date is rejected', isPlausibleAuctionDate(new Date('nope'), ref), false);

console.log('\nNON-STRING input is rejected without throwing');
check('null -> null', iso(parse(null as any)), null);
check('undefined -> null', iso(parse(undefined as any)), null);
check('number -> null', iso(parse(20260829 as any)), null);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
