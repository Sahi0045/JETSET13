import puppeteer from "puppeteer";
// Native recursive character text splitter — no external dependency required.
// Mirrors the behaviour of LangChain's RecursiveCharacterTextSplitter.
class NativeTextSplitter {
  /**
   * @param {{ chunkSize?: number, chunkOverlap?: number, separators?: string[] }} options
   */
  constructor({ chunkSize = 500, chunkOverlap = 50, separators } = {}) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
    this.separators = separators ?? ["\n\n", "\n", ". ", "! ", "? ", " ", ""];
  }

  /**
   * Split an array of text strings into overlapping chunks.
   * @param {string[]} texts
   * @returns {Promise<Array<{ pageContent: string }>>}
   */
  async createDocuments(texts) {
    const chunks = [];
    for (const text of texts) {
      for (const chunk of this._splitText(text, this.separators)) {
        chunks.push({ pageContent: chunk });
      }
    }
    return chunks;
  }

  /** @private */
  _splitText(text, separators) {
    const results = [];
    const sep = separators[0] ?? "";
    const remainingSeps = separators.slice(1);

    const parts = sep ? text.split(sep) : [...text];
    let currentChunk = "";

    for (const part of parts) {
      const candidate = currentChunk ? currentChunk + sep + part : part;

      if (candidate.length <= this.chunkSize) {
        currentChunk = candidate;
      } else {
        // Flush current chunk
        if (currentChunk.trim().length > 0) {
          results.push(currentChunk.trim());
        }

        // If the part itself is too large and we have more separators, recurse
        if (part.length > this.chunkSize && remainingSeps.length > 0) {
          for (const sub of this._splitText(part, remainingSeps)) {
            results.push(sub);
          }
          currentChunk = "";
        } else {
          currentChunk = part;
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      results.push(currentChunk.trim());
    }

    // Add overlap between consecutive chunks
    return this._addOverlap(results);
  }

  /** @private */
  _addOverlap(chunks) {
    if (this.chunkOverlap === 0 || chunks.length <= 1) return chunks;

    const overlapped = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const overlap = prev.slice(-this.chunkOverlap);
      overlapped.push(overlap + " " + chunks[i]);
    }
    return overlapped;
  }
}
import geminiService from "./gemini.service.js";
import chatModel from "../models/chat.model.js";
import chatbotConfig from "../../config/chatbot.js";

// ---------------------------------------------------------------------------
// ContentIndexer
//
// Crawls website pages with Puppeteer, splits the text into chunks using
// LangChain's RecursiveCharacterTextSplitter, generates embeddings via
// Gemini, and stores everything in the content_embeddings Supabase table for
// later semantic (pgvector) retrieval.
//
// Usage (one-off):
//   import contentIndexer from './content-indexer.js';
//   await contentIndexer.indexAll();
//
// Usage (incremental):
//   await contentIndexer.indexUrl('https://example.com/faq');
// ---------------------------------------------------------------------------

class ContentIndexer {
  constructor() {
    this.splitter = new NativeTextSplitter({
      chunkSize: chatbotConfig.indexing.chunkSize,
      chunkOverlap: chatbotConfig.indexing.chunkOverlap,
      separators: ["\n\n", "\n", ". ", "! ", "? ", " ", ""],
    });

    // Concurrency cap — keep Puppeteer memory usage bounded
    this.maxConcurrency = 3;

    // Selectors whose text we want to skip (nav, footer, scripts, etc.)
    this.skipSelectors = [
      "nav",
      "footer",
      "header",
      "script",
      "style",
      "noscript",
      "[aria-hidden='true']",
      ".cookie-banner",
      ".chat-widget",
    ];
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Index all URLs defined in chatbotConfig.indexing.crawlUrls.
   * Processes them with limited concurrency to avoid overloading the browser.
   *
   * @param {string} baseUrl - The base URL of the site (e.g. "https://example.com")
   * @returns {Promise<IndexResult>}
   */
  async indexAll(
    baseUrl = process.env.SITE_BASE_URL || "http://localhost:5004",
  ) {
    const urls = chatbotConfig.indexing.crawlUrls.map(
      (path) => `${baseUrl.replace(/\/$/, "")}${path}`,
    );

    console.log(
      `🕷️  ContentIndexer: Starting full index of ${urls.length} URLs`,
    );
    const started = Date.now();

    const results = { indexed: 0, skipped: 0, failed: 0, errors: [] };

    // Process in batches of maxConcurrency
    for (let i = 0; i < urls.length; i += this.maxConcurrency) {
      const batch = urls.slice(i, i + this.maxConcurrency);
      const batchResults = await Promise.allSettled(
        batch.map((url) => this.indexUrl(url)),
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.indexed += result.value.chunksIndexed;
          results.skipped += result.value.chunksSkipped;
        } else {
          results.failed++;
          results.errors.push(result.reason?.message ?? String(result.reason));
        }
      }
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `✅ ContentIndexer: Full index complete in ${elapsed}s — ` +
      `indexed=${results.indexed} skipped=${results.skipped} failed=${results.failed}`,
    );

    return results;
  }

  /**
   * Index (or re-index) a single URL.
   *
   * @param {string} url - Fully-qualified URL to crawl
   * @returns {Promise<{ url: string, chunksIndexed: number, chunksSkipped: number }>}
   */
  async indexUrl(url) {
    console.log(`🔍 ContentIndexer: Indexing ${url}`);

    let browser;
    try {
      browser = await this._launchBrowser();
      const rawText = await this._extractText(browser, url);

      if (!rawText || rawText.trim().length < 50) {
        console.warn(`⚠️  ContentIndexer: Skipping ${url} — insufficient text`);
        return { url, chunksIndexed: 0, chunksSkipped: 1 };
      }

      const chunks = await this._splitText(rawText);
      console.log(
        `📄 ContentIndexer: ${url} → ${chunks.length} chunks to embed`,
      );

      const { indexed, skipped } = await this._embedAndStore(url, chunks);

      return { url, chunksIndexed: indexed, chunksSkipped: skipped };
    } finally {
      if (browser) {
        await browser.close().catch(() => { });
      }
    }
  }

  /**
   * Delete all embeddings for a given URL and re-index from scratch.
   * Useful when page content has changed significantly.
   *
   * @param {string} url
   * @param {string} baseUrl
   */
  async reindexUrl(url, baseUrl) {
    await this._deleteEmbeddingsForUrl(url);
    return this.indexUrl(url.startsWith("http") ? url : `${baseUrl}${url}`);
  }

  /**
   * Delete ALL stored embeddings (wipe the content index).
   * Call before a full re-index if you want a clean slate.
   */
  async clearIndex() {
    console.log("🗑️  ContentIndexer: Clearing all embeddings…");
    try {
      // Import supabase directly to avoid going through chatModel's helper
      const { default: supabase } = await import("../config/supabase.js");
      const { error } = await supabase
        .from("content_embeddings")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      console.log("✅ ContentIndexer: Index cleared.");
    } catch (err) {
      console.error("ContentIndexer clearIndex error:", err.message);
      throw err;
    }
  }

  /**
   * Return a simple status object: total chunks indexed, last updated, etc.
   */
  async getStatus() {
    try {
      const { default: supabase } = await import("../config/supabase.js");
      const { data, error } = await supabase
        .from("content_embeddings")
        .select("source_url, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const byUrl = (data ?? []).reduce((acc, row) => {
        if (!acc[row.source_url]) acc[row.source_url] = 0;
        acc[row.source_url]++;
        return acc;
      }, {});

      return {
        totalChunks: (data ?? []).length,
        indexedUrls: Object.keys(byUrl).length,
        lastIndexed: data?.[0]?.created_at ?? null,
        breakdown: byUrl,
      };
    } catch (err) {
      console.error("ContentIndexer getStatus error:", err.message);
      return {
        totalChunks: 0,
        indexedUrls: 0,
        lastIndexed: null,
        breakdown: {},
      };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Launch a headless Chromium browser with safe defaults.
   * @private
   */
  async _launchBrowser() {
    return puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
      timeout: 30_000,
    });
  }

  /**
   * Open the URL in Puppeteer, remove boilerplate elements, and return
   * the visible text content of the page.
   *
   * @param {import('puppeteer').Browser} browser
   * @param {string} url
   * @returns {Promise<string>}
   * @private
   */
  async _extractText(browser, url) {
    const page = await browser.newPage();

    try {
      // Block images, fonts, and media to speed up loading
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const type = req.resourceType();
        if (["image", "font", "media", "stylesheet"].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.setUserAgent(
        "Mozilla/5.0 (compatible; JetSettersBot/1.0; +https://jetsetters.com/bot)",
      );

      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 30_000,
      });

      // Remove noisy elements before extracting text
      await page.evaluate((selectors) => {
        for (const sel of selectors) {
          for (const el of document.querySelectorAll(sel)) {
            el.remove();
          }
        }
      }, this.skipSelectors);

      // Pull inner text from the body (preserves whitespace structure)
      const text = await page.evaluate(() => {
        // Try to grab the main content area first
        const mainEl =
          document.querySelector("main") ||
          document.querySelector('[role="main"]') ||
          document.querySelector("article") ||
          document.querySelector(".content") ||
          document.body;

        return mainEl?.innerText ?? "";
      });

      return this._cleanText(text);
    } finally {
      await page.close().catch(() => { });
    }
  }

  /**
   * Normalise whitespace, remove excessive blank lines, etc.
   * @param {string} raw
   * @returns {string}
   * @private
   */
  _cleanText(raw) {
    return raw
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ") // collapse horizontal whitespace
      .replace(/\n{3,}/g, "\n\n") // at most 2 consecutive newlines
      .replace(/^[ \t]+|[ \t]+$/gm, "") // trim horizontal whitespace per line
      .trim();
  }

  /**
   * Split a long text into overlapping chunks using LangChain.
   * @param {string} text
   * @returns {Promise<string[]>}
   * @private
   */
  async _splitText(text) {
    const docs = await this.splitter.createDocuments([text]);
    return docs
      .map((doc) => doc.pageContent.trim())
      .filter((c) => c.length > 20);
  }

  /**
   * Generate embeddings for each chunk and upsert into content_embeddings.
   * Skips chunks whose (sourceUrl + hash) already exist in the table.
   *
   * @param {string} sourceUrl
   * @param {string[]} chunks
   * @returns {Promise<{ indexed: number, skipped: number }>}
   * @private
   */
  async _embedAndStore(sourceUrl, chunks) {
    let indexed = 0;
    let skipped = 0;

    // Fetch existing chunk hashes for this URL to allow incremental updates
    const existingHashes = await this._getExistingHashes(sourceUrl);

    for (const chunk of chunks) {
      const hash = this._hashChunk(chunk);

      if (existingHashes.has(hash)) {
        skipped++;
        continue;
      }

      try {
        const embedding = await geminiService.generateEmbedding(chunk);

        await chatModel.saveEmbedding(sourceUrl, chunk, embedding, { hash });

        indexed++;
        console.log(
          `  ✔ Embedded chunk ${indexed + skipped}/${chunks.length} from ${sourceUrl}`,
        );

        // Small delay between API calls to stay within rate limits
        await this._delay(200);
      } catch (err) {
        console.error(
          `  ✖ Failed to embed chunk from ${sourceUrl}: ${err.message}`,
        );
        // Continue with remaining chunks rather than aborting the whole URL
      }
    }

    return { indexed, skipped };
  }

  /**
   * Retrieve the set of chunk hashes already stored for a given source URL.
   * We store the hash in the metadata JSONB column.
   *
   * @param {string} sourceUrl
   * @returns {Promise<Set<string>>}
   * @private
   */
  async _getExistingHashes(sourceUrl) {
    try {
      const { default: supabase } = await import("../config/supabase.js");
      const { data, error } = await supabase
        .from("content_embeddings")
        .select("metadata")
        .eq("source_url", sourceUrl);

      if (error) throw error;

      const hashes = new Set();
      for (const row of data ?? []) {
        if (row.metadata?.hash) hashes.add(row.metadata.hash);
      }
      return hashes;
    } catch (err) {
      console.error("ContentIndexer _getExistingHashes error:", err.message);
      return new Set();
    }
  }

  /**
   * Delete all stored embeddings for a given source URL.
   * @param {string} sourceUrl
   * @private
   */
  async _deleteEmbeddingsForUrl(sourceUrl) {
    try {
      const { default: supabase } = await import("../config/supabase.js");
      const { error } = await supabase
        .from("content_embeddings")
        .delete()
        .eq("source_url", sourceUrl);

      if (error) throw error;
      console.log(`🗑️  Deleted embeddings for ${sourceUrl}`);
    } catch (err) {
      console.error(
        "ContentIndexer _deleteEmbeddingsForUrl error:",
        err.message,
      );
    }
  }

  /**
   * Produce a lightweight hash of a text chunk for change-detection.
   * Uses a simple FNV-1a 32-bit algorithm — good enough for our purposes.
   *
   * @param {string} text
   * @returns {string} hex string
   * @private
   */
  _hashChunk(text) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0; // keep it 32-bit unsigned
    }
    return hash.toString(16).padStart(8, "0");
  }

  /**
   * Promise-based delay helper.
   * @param {number} ms
   * @private
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton
export default new ContentIndexer();
