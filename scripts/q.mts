/** Ad-hoc read-only SQL against the Farmscope DB. Usage: npx tsx scripts/q.mts "select ..." */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);
const rows = await sql(process.argv.slice(2).join(' '));
console.table(rows);
