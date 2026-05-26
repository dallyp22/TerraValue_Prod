import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env";
import { api } from "./routes/api";

const app = new Hono<{ Bindings: Env }>();

app.use(
  "*",
  cors({
    origin: (origin) => origin,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "SAMEORIGIN");
  c.header("X-XSS-Protection", "1; mode=block");
  await next();
});

app.route("/api", api);

app.notFound((c) => c.json({ success: false, message: "Not found" }, 404));

app.onError((err, c) => {
  console.error(`[ERROR] ${c.req.method} ${c.req.path}:`, err);
  return c.json(
    {
      success: false,
      message: err.message || "Internal Server Error",
    },
    500,
  );
});

export default app;
