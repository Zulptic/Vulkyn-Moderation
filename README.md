# Vulkyn Moderation

An AI integrated moderation tool that can detect and respond to harmful content in real-time. Built around what we as developers wanted to see in a moderation bot. Offering high customizability, and ofcourse, top-notch moderation. Designed to scale across thousands of guilds using Kubernetes sharding and Redis communication for fast a fast and reliable backend.

## Tech Stack

- **Runtime:** Node.js 22+
- **Discord Library:** discord.js v14
- **Database:** PostgreSQL
- **Cache & Pub/Sub:** Redis
- **AI Moderation:** OpenAI Moderation API
- **Orchestration:** Kubernetes

## File Breakdown

### `src/index.js`
Entry point. Initializes the Discord client, connects to PostgreSQL and Redis, loads handlers, and logs in. Handles K8s StatefulSet shard assignment by extracting the pod index from the hostname automatically. Sets up Redis pub/sub to listen for config changes across shards. Includes graceful shutdown on SIGTERM/SIGINT.

### `src/handlers/commandHandler.js`
Dynamically loads all command files from `src/commands/slash/` and `src/commands/prefix/`. Registers slash commands per-guild (not globally) based on each guild's JSONB config. Supports three command modes (`both`, `slash`, `prefix`) and per-command disabling via the `disabledCommands` array. Exposes `syncGuildCommands()` for re-syncing a guild's slash commands when their config changes.

### `src/handlers/eventHandler.js`
Dynamically loads all event files from `src/events/` and registers them on the Discord client. Each event file exports a `name`, `execute` function, and optionally `once`.

### `src/events/clientReady.js`
Fires once on login. Logs bot status and guild count, then syncs slash commands for every guild on this shard based on their individual configs.

### `src/events/messageCreate.js`
Handles prefix commands. Looks up the guild's custom prefix from Redis cache (falls back to PostgreSQL). Respects `commandMode` — silently ignores prefix commands if the guild is set to `slash` only.

### `src/events/interactionCreate.js`
Routes incoming slash command interactions to the matching command file. Respects `commandMode` — replies with an ephemeral "disabled" message if the guild is set to `prefix` only.

### `src/events/guildCreate.js`
Fires when the bot joins a new guild. Inserts a default config row into PostgreSQL with all default settings (automod off, prefix `!`, both command modes enabled). Then syncs slash commands for the new guild.

### `src/services/guildConfig.js`
Handles reading and writing guild configs. Reads from Redis cache first (5 min TTL), falls back to PostgreSQL. On write, invalidates the cache and publishes to the `config:update` Redis channel so all shards pick up the change.

### `src/utils/logger.js`
Lightweight structured logger. Tags every log line with a timestamp, shard ID, and log level. Supports `error`, `warn`, `info`, and `debug` levels controlled by the `LOG_LEVEL` env var.

## Guild Config (JSONB)

Each guild gets a config stored as JSONB in PostgreSQL. Default config on join:

```json
{
  "commandMode": "both",
  "prefix": "!",
  "disabledCommands": []
}
```

### Config Options

- **`commandMode`** — `"both"`, `"slash"`, or `"prefix"`. Controls which command types are active. Slash commands are registered/deregistered from Discord's API per-guild.
- **`prefix`** — The prefix for prefix commands. Default is `!`.
- **`disabledCommands`** — Array of command names to exclude from the slash command registry (e.g. `["hi", "mute"]`).

## Prerequisites

- Node.js 22.12.0+
- PostgreSQL 16+
- Redis 7+ (or Memurai on Windows)
- A Discord bot token and application

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd Vulkyn-Moderation
npm install
```

### 2. Environment variables

Copy `.env` and fill in your values:

```
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DATABASE_URL=postgresql://user:password@localhost:5432/moderation_bot
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=your_openai_key
NODE_ENV=development
LOG_LEVEL=info
```

### 3. Create the database

```bash
psql -U postgres -c "CREATE DATABASE moderation_bot;"
```

Then create the guild configs table:

```sql
CREATE TABLE guild_configs (
    guild_id VARCHAR(20) PRIMARY KEY,
    guild_name VARCHAR(100),
    config JSONB NOT NULL DEFAULT '{}',
    plan VARCHAR(20) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Run the bot

```bash
node src/index.js
```

Make sure you run this from the project root (not from inside `src/`), otherwise dotenv won't find the `.env` file.

## Sharding

The bot is designed to run one shard per process, orchestrated by Kubernetes.

### Local testing with multiple shards

Open two terminals from the project root:

**Terminal 1:**
```bash
TOTAL_SHARDS=2 SHARD_ID=0 node src/index.js
```

**Terminal 2:**
```bash
TOTAL_SHARDS=2 SHARD_ID=1 node src/index.js
```

On Windows PowerShell:
```powershell
$env:TOTAL_SHARDS=2; $env:SHARD_ID=0; node src/index.js
```

### Production (Kubernetes)

In production, shards are assigned automatically via K8s StatefulSet pod hostnames (`vulkyn-0`, `vulkyn-1`, etc.). Set `TOTAL_SHARDS` in the deployment config and scale replicas to match.

### Multi-host sharding

For running shards across multiple servers, each host runs a subset of shard IDs. All hosts connect to the same central PostgreSQL and Redis instances. No bot code changes required.

## License

Proprietary. All rights reserved.