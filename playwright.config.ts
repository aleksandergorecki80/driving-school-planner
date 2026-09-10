import { defineConfig } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.test" });

export default defineConfig({
  testDir: "./e2e",
  // All specs run against one shared `next dev` server (webServer, below), and several
  // specs drive real browser interactions plus real 30s poll waits. Running them in
  // parallel workers pushes that single dev-mode server (compiling on demand, not a
  // production build) into resource contention that manifests as intermittent UI-timing
  // flakes unrelated to the tests themselves — confirmed by the same suite passing
  // reliably serially and flaking only under default parallelism. With only a handful of
  // specs, parallelism buys little here anyway.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    // storageState: "playwright/.auth/user.json",
  },
  // Auto-start the dev server so `npm run test:e2e` is a single command.
  // Reuses an already-running dev server locally (start it yourself for a faster loop);
  // spawns a fresh one otherwise.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
