import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

dotenv.config({ path: path.resolve(import.meta.dirname, ".env.test") });

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/globalSetup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // All test files share one real Postgres database (see tests/helpers.ts
    // resetDb()); running files in parallel lets one file's reset delete
    // rows another file's test is mid-flight on. Sequential files avoid the
    // race without needing a database-per-file setup.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      NEWS_API_KEY: process.env.NEWS_API_KEY ?? "",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "",
      APP_PASSWORD: process.env.APP_PASSWORD ?? "",
    },
  },
});
