#!/usr/bin/env node
/**
 * jobs/content-indexing.js
 *
 * Scheduled content-indexing job for the JetSetters Gemini chatbot.
 *
 * Responsibilities:
 *  - Crawl all URLs defined in chatbotConfig.indexing.crawlUrls
 *  - Generate embeddings with Gemini text-embedding-004
 *  - Store chunks + vectors in the content_embeddings Supabase table
 *  - Support incremental re-indexing (skip unchanged chunks)
 *  - Run on a schedule (default: daily at 02:00 server time)
 *  - Expose a CLI for manual / CI-triggered runs
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *
 *  Scheduled (long-running process):
 *    node jobs/content-indexing.js
 *
 *  One-shot full index (CI / manual):
 *    node jobs/content-indexing.js --run-now
 *
 *  Re-index a single URL:
 *    node jobs/content-indexing.js --url /faq
 *
 *  Wipe and re-index everything:
 *    node jobs/content-indexing.js --full-reset
 *
 *  Print current index status:
 *    node jobs/content-indexing.js --status
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *
 *  GEMINI_API_KEY      (required) — Gemini API key
 *  SUPABASE_URL        (required) — Supabase project URL
 *  SUPABASE_SERVICE_ROLE_KEY (required) — Supabase service-role key
 *  SITE_BASE_URL       (optional) — Base URL to prepend to crawl paths
 *                                   Defaults to http://localhost:5004
 *  INDEX_CRON_HOUR     (optional) — Hour (0-23) at which the daily job runs
 *                                   Defaults to 2 (02:00)
 *  INDEX_CRON_MINUTE   (optional) — Minute at which the daily job runs
 *                                   Defaults to 0
 * ─────────────────────────────────────────────────────────────────────────────
 */

import dotenv from "dotenv";

// Load env vars before any other import that might need them
dotenv.config();
dotenv.config({ path: "./backend/.env" });

import contentIndexer from "../backend/services/content-indexer.js";
import chatbotConfig from "../config/chatbot.js";

// ─────────────────────────────────────────────────────────────────────────────
// Logging helpers
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, "0");

function timestamp() {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function log(level, ...args) {
  const icons = { info: "ℹ️ ", warn: "⚠️ ", error: "❌", success: "✅" };
  console.log(`[${timestamp()}] ${icons[level] ?? "  "}`, ...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Guard: verify required environment variables are present
// ─────────────────────────────────────────────────────────────────────────────

function assertEnv() {
  const required = [
    "GEMINI_API_KEY",
    "SUPABASE_URL",
  ];

  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    log(
      "error",
      `Missing required environment variables: ${missing.join(", ")}`,
    );
    log("error", "Add them to your .env file and retry.");
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core job logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a full index of all configured URLs.
 *
 * @param {{ reset?: boolean }} options
 * @returns {Promise<void>}
 */
async function runFullIndex({ reset = false } = {}) {
  const baseUrl =
    process.env.SITE_BASE_URL || "http://localhost:5004";

  log("info", `Starting ${reset ? "FULL RESET " : ""}content index`);
  log("info", `Base URL : ${baseUrl}`);
  log(
    "info",
    `URLs     : ${chatbotConfig.indexing.crawlUrls.join(", ")}`,
  );

  const started = Date.now();

  try {
    if (reset) {
      log("warn", "Clearing existing index before full re-index…");
      await contentIndexer.clearIndex();
      log("success", "Index cleared.");
    }

    const results = await contentIndexer.indexAll(baseUrl);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    log("success", `Index run complete in ${elapsed}s`);
    log("info", `  Chunks indexed : ${results.indexed}`);
    log("info", `  Chunks skipped : ${results.skipped}`);
    log("info", `  URLs failed    : ${results.failed}`);

    if (results.errors.length > 0) {
      log("warn", "Errors encountered:");
      results.errors.forEach((e, i) => log("warn", `  ${i + 1}. ${e}`));
    }
  } catch (err) {
    log("error", `Index run failed after ${((Date.now() - started) / 1000).toFixed(1)}s:`, err.message);
    if (process.env.NODE_ENV !== "production") {
      console.error(err.stack);
    }
    throw err;
  }
}

/**
 * Re-index a single page path or fully-qualified URL.
 *
 * @param {string} urlOrPath - e.g. "/faq" or "https://example.com/faq"
 */
async function runSingleUrlIndex(urlOrPath) {
  const baseUrl = process.env.SITE_BASE_URL || "http://localhost:5004";
  const url = urlOrPath.startsWith("http")
    ? urlOrPath
    : `${baseUrl.replace(/\/$/, "")}${urlOrPath}`;

  log("info", `Re-indexing single URL: ${url}`);

  try {
    const result = await contentIndexer.reindexUrl(url, baseUrl);
    log("success", `Done — ${result.chunksIndexed} chunks indexed, ${result.chunksSkipped} skipped`);
  } catch (err) {
    log("error", `Failed to index ${url}: ${err.message}`);
    throw err;
  }
}

/**
 * Print current index statistics to stdout.
 */
async function printStatus() {
  log("info", "Fetching content index status…");

  try {
    const status = await contentIndexer.getStatus();

    console.log("\n── Content Index Status ──────────────────────────────────");
    console.log(`  Total chunks   : ${status.totalChunks}`);
    console.log(`  Indexed URLs   : ${status.indexedUrls}`);
    console.log(
      `  Last indexed   : ${status.lastIndexed ?? "never"}`,
    );

    if (Object.keys(status.breakdown).length > 0) {
      console.log("\n  Breakdown by URL:");
      for (const [url, count] of Object.entries(status.breakdown)) {
        console.log(`    ${count.toString().padStart(4)} chunks — ${url}`);
      }
    }

    console.log("──────────────────────────────────────────────────────────\n");
  } catch (err) {
    log("error", "Failed to fetch status:", err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple cron scheduler (no external dependency required)
//
// Checks every minute whether the current time matches the configured
// HOUR:MINUTE and fires the job if it does.  Works reliably for daily
// schedules without needing node-cron or similar packages.
// ─────────────────────────────────────────────────────────────────────────────

let lastRunDate = null; // ISO date string "YYYY-MM-DD" of the last successful run

function getScheduledTime() {
  return {
    hour: parseInt(process.env.INDEX_CRON_HOUR ?? "2", 10),
    minute: parseInt(process.env.INDEX_CRON_MINUTE ?? "0", 10),
  };
}

/**
 * Called every minute to check whether it's time to run the job.
 */
async function schedulerTick() {
  const now = new Date();
  const { hour, minute } = getScheduledTime();

  // Only fire if we're in the right minute and haven't already run today
  const todayStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const isScheduledMinute =
    now.getHours() === hour && now.getMinutes() === minute;

  if (isScheduledMinute && lastRunDate !== todayStr) {
    log("info", `Scheduled trigger at ${pad(hour)}:${pad(minute)} — starting job`);
    lastRunDate = todayStr;

    try {
      await runFullIndex();
    } catch (err) {
      // Already logged inside runFullIndex; reset lastRunDate so it can
      // retry on the next matching minute if we're still in the same minute
      // window (unlikely in practice, but safe).
      lastRunDate = null;
    }
  }
}

/**
 * Start the long-running scheduler process.
 */
function startScheduler() {
  const { hour, minute } = getScheduledTime();

  log(
    "info",
    `Content-indexing scheduler started — daily job at ${pad(hour)}:${pad(minute)}`,
  );
  log("info", `Site base URL : ${process.env.SITE_BASE_URL || "http://localhost:5004"}`);
  log("info", 'Send SIGTERM or Ctrl-C to stop.');

  // Fire immediately on startup (useful during first deployment)
  schedulerTick();

  // Then tick once per minute
  const intervalId = setInterval(schedulerTick, 60_000);

  // Graceful shutdown
  const shutdown = (signal) => {
    log("info", `Received ${signal} — shutting down scheduler`);
    clearInterval(intervalId);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Keep the process alive
  process.stdin.resume();
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  assertEnv();

  const args = process.argv.slice(2);

  // ── --status ─────────────────────────────────────────────────────────────
  if (args.includes("--status")) {
    await printStatus();
    process.exit(0);
  }

  // ── --url <path-or-url> ──────────────────────────────────────────────────
  const urlFlagIndex = args.indexOf("--url");
  if (urlFlagIndex !== -1) {
    const target = args[urlFlagIndex + 1];
    if (!target) {
      log("error", "--url requires a path or URL argument");
      log("error", "Example: node jobs/content-indexing.js --url /faq");
      process.exit(1);
    }
    await runSingleUrlIndex(target);
    process.exit(0);
  }

  // ── --full-reset ─────────────────────────────────────────────────────────
  if (args.includes("--full-reset")) {
    await runFullIndex({ reset: true });
    process.exit(0);
  }

  // ── --run-now ────────────────────────────────────────────────────────────
  if (args.includes("--run-now")) {
    await runFullIndex();
    process.exit(0);
  }

  // ── --help ───────────────────────────────────────────────────────────────
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
JetSetters Content Indexing Job

Usage:
  node jobs/content-indexing.js [option]

Options:
  (no option)         Start the scheduler (runs daily at configured time)
  --run-now           Run a full incremental index immediately, then exit
  --full-reset        Wipe the index and rebuild from scratch, then exit
  --url <path|url>    Re-index a single page path or URL, then exit
  --status            Print current index statistics and exit
  --help, -h          Show this help message

Environment variables:
  GEMINI_API_KEY          Gemini API key (required)
  SUPABASE_URL            Supabase project URL (required)
  SUPABASE_SERVICE_ROLE_KEY  Supabase service-role key (required)
  SITE_BASE_URL           Base URL for crawling (default: http://localhost:5004)
  INDEX_CRON_HOUR         Hour for daily schedule (default: 2)
  INDEX_CRON_MINUTE       Minute for daily schedule (default: 0)

Examples:
  node jobs/content-indexing.js
  node jobs/content-indexing.js --run-now
  node jobs/content-indexing.js --full-reset
  node jobs/content-indexing.js --url /faq
  node jobs/content-indexing.js --url https://jetsetters.com/policies/cancellation
  node jobs/content-indexing.js --status
    `);
    process.exit(0);
  }

  // ── Default: start the long-running scheduler ────────────────────────────
  startScheduler();
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

main().catch((err) => {
  log("error", "Unhandled error in main():", err.message);
  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }
  process.exit(1);
});
