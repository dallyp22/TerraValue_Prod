import { Hono } from "hono";
import type { Env } from "../env";
import { makeDb } from "../db";

export const health = new Hono<{ Bindings: Env }>();

health.get("/", async (c) => {
  try {
    const { pool } = makeDb(c.env.DATABASE_URL);
    await pool.query("SELECT 1");
    return c.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      services: { database: "connected", api: "operational" },
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return c.json(
      {
        success: false,
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        services: { database: "error", api: "degraded" },
        error: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    );
  }
});
