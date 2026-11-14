# Account CRM

A live CRM for two accounts. It reads data through the MCP, stores it, and answers five questions per account: what the book is worth, who holds the power, what to do first, what is about to go wrong, and what is still unknown. Every number carries the id of the record it came from.

## Run it

Needs Node 20 or newer. No dependencies to install.

```bash
export AQ_TOKEN=your-token      # server-side only, never commit it
node server.js                  # http://localhost:3000
```

On a host (Render, Railway, Fly, any Node or Docker host): set `AQ_TOKEN` as an environment variable in the dashboard, start command `node server.js`. A `Dockerfile` is included. Optional: `DATA_DIR` to point the store at a persistent disk (without one the app simply refetches after a restart), `MAX_NOTES` to cap write-backs.

## How it stays inside the rate limit

The MCP allows one call a minute per token. The server owns one queue and spaces calls by 62 seconds; the browser never talks to the MCP and never sees the token.

1. First pull, in priority order: `get_my_accounts`, `get_signals`, `get_all_paperwork` for each account, then team, feature requests, release notes, `whoami`, `get_data_format`. Each is stored in `data/store.json`.
2. After that, `get_signals` is re-read about every 2.5 minutes, so new events appear without a code change or a reload. Accounts and paperwork are refreshed every 20 minutes.
3. Conclusions are written back with `write_note` (top three moves and the sharpest risks per account), once each, deduplicated by hash.

## Where the rules live

- `analyze.js`: the five answers. Field names are looked up under several likely spellings, so it adapts to the schema; see the "Raw data" tab and `/api/raw/<name>` to check what was read.
- `mcp.js`: the MCP client and rate-limited queue.
- `sync.js`: scheduling, storage, write-back.
- `index.html`: the page.

## Rules it follows

- A deal value counts toward the book only if an offer, file or contract record states it. Anything else is listed apart as unbacked, with the call or email where someone said it.
- Ids come from the data. When a record has no id, the page shows its position (for example `get_my_accounts › A › deals[0]`) in italics instead of inventing one.
- Moves are ranked, owned and dated, and the due date is always before the deadline it serves.
- Gaps name who could fill them, using people from the data or the FlytBase team list.
