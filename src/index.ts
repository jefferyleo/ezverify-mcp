#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";

// ── Config ────────────────────────────────────────────────────────────────────
const PORT     = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
const BASE_URL = "https://ezverify.app";
const IS_HTTP  = PORT !== null;

// Per-request API key storage (HTTP mode only)
const apiKeyStorage = new AsyncLocalStorage<string>();

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function ezFetch(path: string, init?: RequestInit): Promise<unknown> {
  const apiKey = IS_HTTP
    ? (apiKeyStorage.getStore() ?? "")
    : (process.env.EZVERIFY_API_KEY ?? "");
  const url = `${BASE_URL}${path}`;
  try {
    const res  = await fetch(url, {
      ...init,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw_response: text || "(empty)" }; }
    if (!res.ok) return { success: false, error: "http_error", status: res.status, message: `HTTP ${res.status} ${res.statusText}`, body };
    return body;
  } catch (err) {
    return { success: false, error: "network_error", message: String(err) };
  }
}

// ── Server ────────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "ezverify", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

// ── tools/list ────────────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "verify_email",
      description: "Verify a single email address. Returns status (valid/invalid/risky/unknown), deliverability score, syntax/domain/MX/SMTP flags, disposable domain detection, role account flag, typo suggestion, and mailbox-full status.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "The email address to verify" },
        },
        required: ["email"],
      },
    },
    {
      name: "verify_emails_bulk",
      description: "Submit an async bulk email verification job. Returns a request_id — poll with get_bulk_job_status.",
      inputSchema: {
        type: "object",
        properties: {
          emails:      { type: "array", items: { type: "string" }, description: "List of email addresses to verify" },
          webhook_url: { type: "string", description: "Optional URL to POST results to when the job completes" },
        },
        required: ["emails"],
      },
    },
    {
      name: "get_bulk_job_status",
      description: "Check the status of a bulk verification job. Returns progress, counts, and full results when completed.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "The request_id returned by verify_emails_bulk" },
        },
        required: ["request_id"],
      },
    },
    {
      name: "get_usage_stats",
      description: "Get EzVerify API usage statistics. Returns total requests, credits used, valid/invalid/risky/unknown counts, average processing time.",
      inputSchema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Number of days to look back (default 30, max 365)", default: 30 },
        },
        required: [],
      },
    },
    {
      name: "get_account_info",
      description: "Get EzVerify account info: current plan, credits remaining, credits used this month, monthly credit limit.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ],
}));

// ── tools/call ────────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  let result: unknown;
  switch (name) {
    case "verify_email":
      result = await ezFetch("/api/v1/verify", {
        method: "POST",
        body: JSON.stringify({ email: a["email"] }),
      });
      break;
    case "verify_emails_bulk":
      result = await ezFetch("/api/v1/verify/bulk", {
        method: "POST",
        body: JSON.stringify({
          emails: a["emails"],
          ...(a["webhook_url"] ? { webhook_url: a["webhook_url"] } : {}),
        }),
      });
      break;
    case "get_bulk_job_status":
      result = await ezFetch(`/api/v1/verify/bulk/${a["request_id"]}`);
      break;
    case "get_usage_stats":
      result = await ezFetch(`/api/v1/usage?days=${a["days"] ?? 30}`);
      break;
    case "get_account_info":
      result = await ezFetch("/api/v1/account");
      break;
    default:
      result = { success: false, error: "unknown_tool", message: `Unknown tool: ${name}` };
  }

  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

// ── Transport — stdio (local) or HTTP (server) ────────────────────────────────
if (IS_HTTP) {
  // HTTP mode — used when deployed on Windows Server via PM2
  const httpServer = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    if (req.url === "/mcp" || req.url === "/") {
      const apiKey =
        ((req.headers["x-api-key"] as string | undefined) ?? "").trim()
        || (process.env.EZVERIFY_API_KEY ?? "");

      await apiKeyStorage.run(apiKey, async () => {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res);
        transport.close();
      });
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "ezverify-mcp" }));
    } else {
      res.writeHead(404).end("Not found");
    }
  });

  httpServer.listen(PORT!, "127.0.0.1", () => {
    process.stderr.write(`[ezverify-mcp] HTTP mode — listening on http://127.0.0.1:${PORT}/mcp\n`);
  });
} else {
  // Stdio mode — used by Claude Desktop locally
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[ezverify-mcp] Stdio mode — ready\n");
}
