# ezverify-mcp

Official [EzVerify](https://www.ezverify.app) MCP server for Claude AI.

## What is EzVerify MCP Server?

EzVerify MCP Server is an official Model Context Protocol (MCP) server that connects Claude AI directly to the EzVerify email verification API. It allows Claude to verify email addresses, run bulk verification jobs, and retrieve account information on your behalf — all through natural conversation, without writing a single line of code or switching between tools.

---

## Setup

Get your API key from [EzVerify Dashboard → Settings → API Key](https://www.ezverify.app/Dashboard/Settings).

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
  "ezverify": {
    "command": "npx",
    "args": ["-y", "ezverify-mcp"],
    "env": {
      "EZVERIFY_API_KEY": "YOUR_EZVERIFY_API_KEY"
    }
  }
}
```

---

## How to Use

Once configured, restart Claude Desktop and start asking Claude to verify emails in plain English. For example:

- *"Verify this email address for me"*
- *"Check which of these 20 emails are valid"*
- *"How many credits do I have left?"*

No API calls, no code, no documentation — just conversation.

---

## Key Features

- Verify any single email address instantly and get a full result including status, deliverability score, and detailed flags
- Submit bulk email lists for async verification and poll for results when complete
- Detect disposable email addresses, role-based accounts, and common typos automatically
- Check your credit usage and remaining balance without logging into the dashboard
- Retrieve your current plan details and account information on demand
- Works entirely through natural language — no API calls, no code, no context switching
- Stateless and secure — your API key is stored locally in your config file, never on our servers

---

## Available Tools

| Tool | Description |
|------|-------------|
| `verify_email` | Verify a single email — status, score, flags |
| `verify_emails_bulk` | Submit async bulk verification job |
| `get_bulk_job_status` | Poll bulk job progress and results |
| `get_usage_stats` | Credit usage over last N days |
| `get_account_info` | Plan, credits remaining, monthly limit |

---

## Use Cases

- Ask Claude to clean an email list before a campaign launch and return only the valid addresses
- Verify a prospect's email address mid-conversation while researching leads
- Check whether a submitted email is real before triggering an onboarding workflow
- Ask Claude how many credits you have left before running a large verification job
- Bulk verify emails pasted directly into the chat and get a formatted summary of results
- Integrate email verification into Claude-powered workflows and automations without touching any API documentation

---

## Example Prompts

- *"Verify john@example.com — is it safe to send to?"*
- *"Bulk verify these 20 emails and return only the valid ones."*
- *"How many credits have I used in the last 7 days?"*
- *"What plan am I on and how many credits are left this month?"*

---

## FAQ

**Do I need to install anything?**
No. As long as you have Claude Desktop and Node.js installed, the server runs automatically via `npx` — no manual download or setup required.

**Where do I find my API key?**
Log in to your EzVerify dashboard at [www.ezverify.app](https://www.ezverify.app), go to API Settings, and copy your API key from there.

**Does this use my EzVerify credits?**
Yes. Each email verification made through Claude uses the same credits as a direct API call, following your plan's rates.

**Is my API key safe?**
Your API key is stored only in your local Claude Desktop config file and sent directly to the EzVerify API. It is never stored or logged by the MCP server.

**Which Claude plans support MCP servers?**
MCP servers are supported in Claude Desktop with a Claude Pro or Team subscription.

**Can I use this with Claude Code?**
Yes. Add a `.mcp.json` file to your project root with the same configuration and Claude Code will connect automatically.

**What happens if I run out of credits?**
The tool will return an error message from the API indicating insufficient credits. You can top up from your EzVerify dashboard.

---

## Requirements

- Node.js 18+
- An [EzVerify](https://www.ezverify.app) account (free tier available)
