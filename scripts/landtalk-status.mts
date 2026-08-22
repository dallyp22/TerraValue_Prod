/** Which Land Talk PDFs exist on the archive vs which we've ingested. Read-only, no parsing. */
import 'dotenv/config';
import { discoverLandTalkPdfs } from '../server/services/landTalkParser.js';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const found = await discoverLandTalkPdfs();
const rows = await sql(`select month, status, sales_count from land_talk_pdfs`);
const have = new Map(rows.map((r: any) => [r.month, r]));

const byMonth = new Map<string, any[]>();
for (const p of found) {
  const m = (p as any).month ?? 'unknown';
  if (!byMonth.has(m)) byMonth.set(m, []);
  byMonth.get(m)!.push(p);
}
const months = [...byMonth.keys()].sort().reverse();
console.log(`archive: ${found.length} PDFs across ${months.length} months | ingested: ${rows.length}\n`);
for (const m of months) {
  const h = have.get(m);
  console.log(`${m.padEnd(10)} ${h ? `INGESTED (${h.sales_count} sales, ${h.status})` : 'MISSING'}`);
}
