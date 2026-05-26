import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Neon HTTP driver: stateless per-request, works on Cloudflare Workers where
// long-lived WebSocket pools can't span requests. Same Neon DB, lower setup.
const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

// Pool-shaped wrapper so legacy `pool.query(text, params)` / `pool.connect()`
// call sites in services and routes keep working unchanged.
async function runSql<T = any>(
  text: string,
  params: any[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  // The Neon HTTP function is callable directly with (text, params).
  const rows = (await (sql as any)(text, params)) as T[];
  return { rows, rowCount: rows.length };
}

export const pool = {
  query: runSql,
  async connect() {
    // HTTP driver has no connection state; return a thin shim matching the
    // node-pg client surface used by callers.
    return { query: runSql, release: () => {} };
  },
  async end() {
    // No-op: stateless HTTP driver has nothing to tear down.
  },
};
