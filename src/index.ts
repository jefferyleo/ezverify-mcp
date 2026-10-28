#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import { createRequire } from "node:module";

// ── Config ────────────────────────────────────────────────────────────────────
// One version number: package.json. (The server used to report a hard-coded 1.0.0 while npm said 1.0.5.)
const VERSION  = (createRequire(import.meta.url)("../package.json") as { version: string }).version;
const PORT     = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
const HOST     = process.env.HOST || "127.0.0.1";
const BASE_URL = "https://ezverify.app";
const IS_HTTP  = PORT !== null;

const API_KEY_HELP =
  "Generate an API key on https://ezverify.app/Dashboard/ApiUsage (API access needs an EzVerify Starter or Business plan).";
const FETCH_TIMEOUT_MS = 60_000;      // a single check can take ~25 s server side
const MAX_BODY_BYTES   = 1_000_000;   // 1,000 emails is ~50 KB; anything near 1 MB is not a real request

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function ezFetch(apiKey: string, path: string, init?: RequestInit): Promise<unknown> {
  if (!apiKey) {
    return { success: false, error: "missing_api_key", message: `No EzVerify API key was provided. ${API_KEY_HELP}` };
  }
  const url = `${BASE_URL}${path}`;
  try {
    const res  = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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

// ── Tools ─────────────────────────────────────────────────────────────────────
// Annotations are hints for the client's consent UI. Only the two verify tools spend credits.
const TOOLS: Tool[] = [
  {
    name: "verify_email",
    title: "Verify an email address",
    description: "Verify a single email address. Returns status (valid/invalid/risky/unknown), deliverability score, syntax/domain/MX/SMTP flags, disposable domain detection, role account flag, typo suggestion, and mailbox-full status. Uses credits: 1 credit for a definitive result (valid, invalid or risky); unknown results are free. Checking the same address again is charged again.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "The email address to verify" },
      },
      required: ["email"],
    },
    annotations: {
      title: "Verify an email address",
      readOnlyHint: false,     // spends a credit
      destructiveHint: false,  // nothing is deleted or overwritten
      idempotentHint: false,   // a repeat call is billed again
      openWorldHint: true,     // probes the recipient's mail server
    },
  },
  {
    name: "verify_emails_bulk",
    title: "Verify a list of email addresses (bulk job)",
    description: "Submit an async bulk email verification job (up to 1,000 emails per request; duplicate addresses are verified and billed once). Returns a request_id — poll with get_bulk_job_status. Uses credits: 1 credit per address with a definitive result (valid, invalid or risky), charged when the job completes; unknown results are free.",
    inputSchema: {
      type: "object",
      properties: {
        emails:      { type: "array", items: { type: "string" }, description: "List of email addresses to verify" },
        webhook_url: { type: "string", description: "Optional public http(s) URL that gets one POST when the job completes. It carries counts only (campaign_id, which equals the request_id, plus total, valid, invalid, risky and unknown counts), not per-address results; fetch those with get_bulk_job_status. Delivered once, not retried." },
      },
      required: ["emails"],
    },
    annotations: {
      title: "Verify a list of email addresses (bulk job)",
      readOnlyHint: false,     // creates a job and spends credits
      destructiveHint: false,
      idempotentHint: false,   // every call creates a new job
      openWorldHint: true,     // probes the recipients' mail servers
    },
  },
  {
    name: "get_bulk_job_status",
    title: "Check a bulk verification job",
    description: "Check the status of a bulk verification job. Returns progress, counts, and full results when completed. Free: does not use credits.",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "The request_id returned by verify_emails_bulk" },
      },
      required: ["request_id"],
    },
    annotations: {
      title: "Check a bulk verification job",
      readOnlyHint: true,
      openWorldHint: false,    // only talks to your own EzVerify account
    },
  },
  {
    name: "get_usage_stats",
    title: "Get request statistics",
    description: "Get EzVerify request statistics for the last N days: total requests, credits used, valid/invalid/risky/unknown counts, average processing time. Covers single verifications (API or dashboard Quick Verify) plus one entry per bulk submission; credits and per-address results of bulk jobs are NOT included — use get_account_info for this month's credit total. Free: does not use credits.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to look back (default 30, max 365)", default: 30 },
      },
      required: [],
    },
    annotations: {
      title: "Get request statistics",
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_account_info",
    title: "Get account and credit balance",
    description: "Get EzVerify account info: current plan, credits used this calendar month, credits remaining, monthly credit limit. Credits reset on the 1st of each month; usage beyond the limit is billed as overage. Free: does not use credits.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    annotations: {
      title: "Get account and credit balance",
      readOnlyHint: true,
      openWorldHint: false,
    },
  },
];

const invalidInput = (message: string) => ({ success: false, error: "invalid_input", message });

async function callTool(apiKey: string, name: string, a: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "verify_email": {
      if (typeof a["email"] !== "string" || !a["email"].trim()) return invalidInput("email must be a non-empty string.");
      return ezFetch(apiKey, "/api/v1/verify", {
        method: "POST",
        body: JSON.stringify({ email: a["email"] }),
      });
    }
    case "verify_emails_bulk": {
      const emails = a["emails"];
      if (!Array.isArray(emails) || emails.length === 0 || !emails.every((e) => typeof e === "string")) {
        return invalidInput("emails must be a non-empty array of strings.");
      }
      if (a["webhook_url"] !== undefined && typeof a["webhook_url"] !== "string") return invalidInput("webhook_url must be a string.");
      return ezFetch(apiKey, "/api/v1/verify/bulk", {
        method: "POST",
        body: JSON.stringify({
          emails,
          ...(a["webhook_url"] ? { webhook_url: a["webhook_url"] } : {}),
        }),
      });
    }
    case "get_bulk_job_status": {
      if (typeof a["request_id"] !== "string" || !a["request_id"].trim()) return invalidInput("request_id must be a non-empty string.");
      // encode: the id is untrusted text that ends up inside the URL path
      return ezFetch(apiKey, `/api/v1/verify/bulk/${encodeURIComponent(a["request_id"].trim())}`);
    }
    case "get_usage_stats": {
      // clamp: the value is interpolated into the query string
      const days = Math.min(365, Math.max(1, Math.trunc(Number(a["days"] ?? 30)) || 30));
      return ezFetch(apiKey, `/api/v1/usage?days=${days}`);
    }
    case "get_account_info":
      return ezFetch(apiKey, "/api/v1/account");
    default:
      return { success: false, error: "unknown_tool", message: `Unknown tool: ${name}` };
  }
}

// ── Server ────────────────────────────────────────────────────────────────────
// A Server instance holds one transport, so HTTP mode builds a fresh one per request (the SDK's stateless
// pattern). The API key is captured here, so concurrent requests can never see each other's key.
function createServer(apiKey: string): Server {
  const server = new Server(
    { name: "ezverify", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await callTool(apiKey, name, (args ?? {}) as Record<string, unknown>);
    const failed = typeof result === "object" && result !== null && (result as { success?: unknown }).success === false;
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      ...(failed ? { isError: true } : {}),
    };
  });

  return server;
}

// ── HTTP mode ─────────────────────────────────────────────────────────────────
class BodyTooLargeError extends Error {}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent) { res.end(); return; }
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

async function handleMcpPost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // Each caller sends its own key. There is deliberately no server-side fallback key: that would let anyone
  // who can reach this port spend the key's owner's credits.
  const apiKey = String(req.headers["x-api-key"] ?? "").trim();

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    if (err instanceof BodyTooLargeError) return sendJson(res, 413, rpcError(-32600, "Request body too large."));
    return sendJson(res, 400, rpcError(-32700, "Parse error: the request body is not valid JSON."));
  }

  const server    = createServer(apiKey);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  if (path === "/health") {
    return sendJson(res, 200, { status: "ok", server: "ezverify-mcp", version: VERSION });
  }
  if (path !== "/mcp" && path !== "/") {
    return sendJson(res, 404, { error: "not_found" });
  }
  // Browsers always send Origin on cross-site requests; MCP clients do not. Refusing it blocks DNS-rebinding
  // and drive-by calls from web pages (MCP transport spec).
  if (req.headers.origin) {
    return sendJson(res, 403, rpcError(-32000, "Browser requests are not accepted."));
  }
  // Stateless mode: no sessions, so no standalone SSE stream (GET) and nothing to terminate (DELETE).
  if (req.method !== "POST") {
    return sendJson(res, 405, rpcError(-32000, "Method not allowed."), { Allow: "POST" });
  }
  await handleMcpPost(req, res);
}

// ── Transport — stdio (local) or HTTP (server) ────────────────────────────────
if (IS_HTTP) {
  if (!Number.isInteger(PORT) || PORT! < 1 || PORT! > 65535) {
    process.stderr.write(`[ezverify-mcp] Invalid PORT "${process.env.PORT}"\n`);
    process.exit(1);
  }
  const httpServer = http.createServer((req, res) => {
    // An exception must answer this one request, never reach the process as an unhandled rejection.
    handleHttp(req, res).catch((err) => {
      process.stderr.write(`[ezverify-mcp] request failed: ${err instanceof Error ? err.message : String(err)}\n`);
      sendJson(res, 500, rpcError(-32603, "Internal server error"));
    });
  });

  httpServer.listen(PORT!, HOST, () => {
    process.stderr.write(`[ezverify-mcp] HTTP mode — listening on http://${HOST}:${PORT}/mcp (API key from the X-Api-Key header)\n`);
  });
} else {
  // Stdio mode — used by Claude Desktop, Claude Code and other local clients
  const apiKey = (process.env.EZVERIFY_API_KEY ?? "").trim();
  if (!apiKey) process.stderr.write(`[ezverify-mcp] EZVERIFY_API_KEY is not set; tool calls will fail. ${API_KEY_HELP}\n`);
  const server = createServer(apiKey);
  await server.connect(new StdioServerTransport());
  process.stderr.write("[ezverify-mcp] Stdio mode — ready\n");
}
