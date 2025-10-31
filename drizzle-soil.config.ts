import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL_SOIL) {
  console.warn("DATABASE_URL_SOIL not set - soil database operations will be skipped");
  process.exit(0);
}

export default defineConfig({
  out: "./migrations-soil",
  schema: "./shared/soil-schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL_SOIL,
  },
});

