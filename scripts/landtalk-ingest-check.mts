/** Exercise the cron's ingest path. Should report "up to date" in steady state. */
import 'dotenv/config';
import { ingestNewLandTalkPdfs } from '../server/services/landTalkIngest.js';
const r = await ingestNewLandTalkPdfs();
console.log(JSON.stringify({ discovered: r.discovered, monthsMissing: r.monthsMissing, parsed: r.parsed, failed: r.failed, totalComps: r.totalComps }, null, 2));
process.exit(0);
