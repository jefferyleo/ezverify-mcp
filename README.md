# ezverify-mcp

Official [EzVerify](https://ezverify.app) MCP server. Lets Claude verify emails, run bulk jobs, and check account stats directly from a conversation — no code required.

## Setup

Get your API key from [EzVerify Dashboard → Settings → API Key](https://ezverify.app/Dashboard/Settings).

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

## Available Tools

| Tool | Description |
|------|-------------|
| `verify_email` | Verify a single email — status, score, flags |
| `verify_emails_bulk` | Submit async bulk verification job |
| `get_bulk_job_status` | Poll bulk job progress and results |
| `get_usage_stats` | Credit usage over last N days |
| `get_account_info` | Plan, credits remaining, monthly limit |

## Example Prompts

- *"Verify john@example.com — is it safe to send to?"*
- *"Bulk verify these 20 emails and return only the valid ones."*
- *"How many credits have I used in the last 7 days?"*
- *"What plan am I on and how many credits are left this month?"*

## Requirements

- Node.js 18+
- An [EzVerify](https://ezverify.app) account (free tier available)
