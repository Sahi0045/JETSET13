import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod";
import dotenv from "dotenv";

dotenv.config();

const STITCH_API_KEY = process.env.STITCH_API_KEY;
const STITCH_PROJECT_ID = process.env.STITCH_PROJECT_ID;
const STITCH_BASE_URL = "https://stitch.googleapis.com/v1";

if (!STITCH_API_KEY || !STITCH_PROJECT_ID) {
  console.error("❌ Missing STITCH_API_KEY or STITCH_PROJECT_ID in .env");
  process.exit(1);
}

/**
 * Stitch API Helper functions
 */
async function stitchGet(path) {
  const url = `${STITCH_BASE_URL}${path}?key=${STITCH_API_KEY}`;
  const res = await fetch(url, {
    headers: {
      "X-goog-api-key": STITCH_API_KEY,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stitch API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function stitchPost(path, body) {
  const url = `${STITCH_BASE_URL}${path}?key=${STITCH_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-goog-api-key": STITCH_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stitch API error ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * MCP Server Setup
 */
const createServer = () => {
  const server = new McpServer({
    name: "stitch-mcp-server",
    version: "1.0.0"
  });

  // Tool: Get Project Info
  server.tool("stitch_get_project", "Get details about the connected Stitch project", {},
    async () => {
      const data = await stitchGet(`/projects/${STITCH_PROJECT_ID}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    }
  );

  // Tool: List Screens
  server.tool("stitch_list_screens", "List all screens in the Stitch project", {},
    async () => {
      const data = await stitchGet(`/projects/${STITCH_PROJECT_ID}/screens`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    }
  );

  // Tool: Get Screen Details
  server.tool("stitch_get_screen", {
    description: "Get details and code for a specific screen",
    inputSchema: {
      screen_id: z.string().describe("The ID of the screen to retrieve")
    }
  }, async ({ screen_id }) => {
    const data = await stitchGet(`/projects/${STITCH_PROJECT_ID}/screens/${screen_id}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  });

  // Tool: Generate Screen
  server.tool("stitch_generate_screen", {
    description: "Generate a new screen from a prompt",
    inputSchema: {
      prompt: z.string().describe("Description of the screen to generate")
    }
  }, async ({ prompt }) => {
    const data = await stitchPost(`/projects/${STITCH_PROJECT_ID}/screens:generate`, { prompt });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
    };
  });

  return server;
};

/**
 * Express App Setup
 */
const app = express();
app.use(express.json());

// Multi-session transport management
const transports = {};

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newId) => {
          console.log(`🚀 New MCP session: ${newId}`);
          transports[newId] = transport;
        }
      });

      const server = createServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      return res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid session or not an initialization request" },
        id: req.body.id || null
      });
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("❌ MCP Error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: req.body.id || null
      });
    }
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    server: "stitch-mcp-server",
    project_id: STITCH_PROJECT_ID
  });
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`✅ Stitch MCP server running on port ${PORT}`);
  console.log(`   Connected to Project: ${STITCH_PROJECT_ID}`);
});