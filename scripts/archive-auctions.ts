/**
 * Manual trigger for the auction archiver.
 *
 *   npx tsx scripts/archive-auctions.ts --dry-run   # show what would be retired
 *   npx tsx scripts/archive-auctions.ts             # retire them
 *
 * Replaces archive-past-auctions.ts, archive-non-farm-auctions.ts and
 * archive-nonfarm-and-past.ts. Those three each hard-DELETEd rows and each
 * carried its own drifted copy of the non-farm rules — archive-non-farm-auctions
 * matched 'estate auction', bare 'gun' and 'vehicle' against the *description*
 * as well as the title, which is a broader version of the bug that removed
 * thousands of real estate auctions. There is now one implementation, in
 * server/services/auctionArchiver.ts, and it retires rows by setting
 * status='archived' rather than deleting them.
 */
import 'dotenv/config';
import { AuctionArchiverService } from '../server/services/auctionArchiver.js';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const archiver = new AuctionArchiverService();
  await archiver.archivePastAuctions({ dryRun });

  if (dryRun) {
    console.log('\nDry run only — re-run without --dry-run to apply.');
  } else {
    console.log(
      "\nRetired rows kept their data. To reverse:\n" +
        "  UPDATE auctions SET status = 'active'\n" +
        "   WHERE status = 'archived'\n" +
        "     AND raw_data->>'archivedReason' = '<reason>'\n" +
        "     AND raw_data->>'archivedAt' > '<iso timestamp>';",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
