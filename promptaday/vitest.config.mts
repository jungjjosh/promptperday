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
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    },
  },
});
