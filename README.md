# ezverify-mcp: requires an EzVerify Starter or Business plan

**Requires an EzVerify Starter or Business plan.** The Free plan is web-app only: its API key is rejected with `403 plan_upgrade_required`.

[![npm version](https://img.shields.io/npm/v/ezverify-mcp.svg)](https://www.npmjs.com/package/ezverify-mcp)
[![npm downloads](https://img.shields.io/npm/dm/ezverify-mcp.svg)](https://www.npmjs.com/package/ezverify-mcp)
[![MCP.so](https://img.shields.io/badge/MCP.so-ezverify--mcp-764ba2)](https://mcp.so/server/ezverify-mcp/jefferyleo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[EzVerify](https://ezverify.app) MCP server: lets an MCP client such as Claude verify email addresses, run bulk verification jobs and check your credit balance through your EzVerify account.

## What is EzVerify MCP Server?

EzVerify MCP Server is a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects Claude and other MCP clients to the EzVerify email verification API. It lets the assistant verify email addresses, submit bulk verification jobs and read your account information on your behalf, from a plain-language conversation.

It calls the EzVerify REST API with your API key, so it needs an EzVerify account on the **Starter or Business** plan.

---

## Setup

Requires a **Starter or Business** plan and Node.js 18+. Generate an API key on the [API Usage page](https://ezverify.app/Dashboard/ApiUsage) of your EzVerify dashboard (Dashboard → API Usage). It is shown once, so store it safely; regenerate it if you lose it.

### Claude Desktop

Add to `claude_desktop_config.json`:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ezverify": {
      "command": "npx",
      "args": ["-y", "ezverify-mcp"],
      "env": {
        "EZVERIFY_API_KEY": "YOUR_EZVERIFY_API_KEY"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Claude Code

Add a `.mcp.json` file at your project root:

```json
{
  "mcpServers": {
    "ezverify": {
      "command": "npx",
      "args": ["-y", "ezverify-mcp"],
      "env": {
        "EZVERIFY_API_KEY": "YOUR_EZVERIFY_API_KEY"
      }
    }
  }
}
```

Your key is in that file, so do not commit it to source control.

### Other MCP clients

Any client that can start a stdio MCP server works the same way: run `npx -y ezverify-mcp` with the `EZVERIFY_API_KEY` environment variable set.

---

## How to Use

Once configured, ask your assistant to verify emails in plain English. For example:

- *"Verify this email address for me"*
- *"Check which of these 20 emails are valid"*
- *"How many credits do I have left?"*

---

## Key Features

- Verify a single email address and get a full result including status, deliverability score and detailed flags
- Submit bulk email lists for async verification and poll for results when complete
- Results include disposable-domain, role-account and typo-suggestion flags
- Check your credit usage and remaining balance without logging into the dashboard
- Retrieve your current plan and account information on demand
- Your API key stays in your local configuration and is sent only to `ezverify.app`; the server does not store or log it

---

## Available Tools

| Tool | Description | Credits |
|------|-------------|---------|
| `verify_email` | Verify a single email: status, score, flags | Uses credits |
| `verify_emails_bulk` | Submit an async bulk verification job (up to 1,000 emails per request) | Uses credits |
| `get_bulk_job_status` | Poll bulk job progress and results | Free |
| `get_usage_stats` | Request statistics over the last N days (single verifications; credits spent by bulk jobs are not included) | Free |
| `get_account_info` | Plan, credits used this month, credits remaining, monthly limit | Free |

The three read-only tools are marked `readOnlyHint` in the tool metadata. `verify_email` and `verify_emails_bulk` are not, because they spend credits, so clients that ask for confirmation before non-read-only tools will ask before running them.

### Limits

- `verify_email` is limited to **100 calls per hour per account** (the API answers `429 rate_limit_exceeded`). The other tools are not limited per hour.
- A bulk job takes **up to 1,000 emails per request**. Duplicates within one request are verified and billed once.
- A bulk `webhook_url` must be a public `http(s)` address. It gets one POST when the job completes, with counts only (`campaign_id`, which equals the `request_id`, and the valid/invalid/risky/unknown totals), not per-address results: fetch those with `get_bulk_job_status`. It is attempted once and not retried.
- An account that is restricted (for example after repeated declined payments) gets `402 account_restricted` on the two verification tools; the read-only tools still work.

---

## Use Cases

- Ask Claude to clean an email list before a campaign launch and return only the valid addresses
- Verify a prospect's email address mid-conversation while researching leads
- Check whether a submitted email is real before triggering an onboarding workflow
- Ask Claude how many credits you have left before running a large verification job
- Bulk verify emails pasted directly into the chat and get a formatted summary of results

---

## Example Prompts

- *"Verify john@example.com — is it safe to send to?"*
- *"Bulk verify these 20 emails and return only the valid ones."*
- *"How many credits have I used this month?"*
- *"What plan am I on and how many credits are left this month?"*

---

## HTTP mode (self-hosting)

By default the server talks to the client over stdio. To run it as a small HTTP service instead, set `PORT`:

```bash
PORT=3100 npx -y ezverify-mcp
```

- It listens on `127.0.0.1` unless you set `HOST`. Put a TLS reverse proxy in front of it if you expose it beyond your machine.
- MCP endpoint: `POST /mcp` (Streamable HTTP, stateless: every request gets its own server instance, there are no sessions). `GET` and `DELETE` answer `405`.
- Each caller sends its own EzVerify API key in an `X-Api-Key` header. The service has no key of its own and never falls back to one from its environment, so `EZVERIFY_API_KEY` is not used in this mode. A call without the header gets a `missing_api_key` tool error.
- Requests that carry an `Origin` header (browsers) are refused with `403`, and a request body over 1 MB with `413`. Clients that can only authenticate with OAuth are not supported.
- `GET /health` returns `{"status":"ok",...}` for monitoring.

---

## FAQ

**Do I need to install anything?**
Node.js 18 or newer. The server runs through `npx`, which downloads and starts it on demand, so there is no separate install step.

**Where do I get my API key?**
Log in to your EzVerify dashboard at [ezverify.app](https://ezverify.app), open **API Usage** ([ezverify.app/Dashboard/ApiUsage](https://ezverify.app/Dashboard/ApiUsage)) and generate a key there. It is shown once, so copy it and store it safely; if you lose it, regenerate it on the same page. API keys only work on the Starter and Business plans.

**Does this use my EzVerify credits?**
Yes, `verify_email` and `verify_emails_bulk` do. They use the same credits as a direct API call, at your plan's rates. Only definitive results (`valid`, `invalid`, `risky`) use a credit; `unknown` results are free. Checking the same address in a separate call is charged again.

**Is my API key safe?**
The server reads your API key from your local configuration and sends it only to the EzVerify API. It does not store or log it. Treat the key like a password, and regenerate it on the API Usage page if it leaks.

**Can I use this with Claude Code?**
Yes. Add a `.mcp.json` file to your project root with the configuration above.

**What happens if I use more than my monthly credits?**
Nothing stops. Credits are counted per calendar month (UTC) and reset on the 1st; unused credits do not roll over. Usage beyond your plan's monthly credits is billed as overage at your plan's per-credit rate (Starter $0.004, Business $0.002); you are charged after the month ends, never up front. Check your balance any time with `get_account_info`.

---

## Requirements

- Node.js 18+
- An [EzVerify](https://ezverify.app) account on the **Starter or Business** plan (the API and this MCP server are not available on the Free plan)

## License

[MIT](LICENSE)
