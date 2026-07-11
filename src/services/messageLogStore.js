import { logger } from '../utils/logger.js';

const RETENTION_DAYS = 30;
const FLUSH_INTERVAL_MS = 2_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly
const MAX_BATCH = 1_000;

const COLUMNS = ['message_id', 'guild_id', 'channel_id', 'user_id', 'username', 'content', 'attachments', 'created_at'];

// Write-only batching buffer. Messages pile up here and get bulk-inserted on a
// timer so we're not firing one INSERT per message. Nothing ever reads from it:
// live-session deletes are served by discord.js's own message cache, and older
// (cache-miss) deletes are served from Postgres.
let buffer = [];

// Decide whether a guild's messages should be stored at all. Only store for
// guilds that actually have message-delete logging configured, so we don't pay
// storage for the (vast majority of) guilds that never enabled it.
export function isMessageDeleteLoggingEnabled(config) {
    const lg = config?.logging;
    if (!lg?.enabled) return false;

    const category = lg.messages;
    if (!category) return false;

    const dest = category.messageDelete;
    const channelId = typeof dest === 'string' ? dest : dest?.channelId ?? category.categoryChannel;
    return Boolean(channelId);
}

export function recordMessage(message) {
    const attachments = message.attachments?.size
        ? [...message.attachments.values()].map(a => a.url).join('\n')
        : null;

    const content = message.content || null;
    if (!content && !attachments) return; // nothing worth persisting

    buffer.push({
        message_id: message.id,
        guild_id: message.guildId,
        channel_id: message.channelId,
        user_id: message.author.id,
        username: message.author.username,
        content,
        attachments,
        created_at: new Date(message.createdTimestamp),
    });
}

export async function lookupMessage(messageId, client) {
    try {
        const { rows } = await client.db.query(
            `SELECT ${COLUMNS.join(', ')} FROM message_logs WHERE message_id = $1`,
            [messageId]
        );
        return rows[0] ?? null;
    } catch (err) {
        logger.error('messageLogStore.lookup failed:', err);
        return null;
    }
}

async function flush(client) {
    if (buffer.length === 0) return;

    const batch = buffer.slice(0, MAX_BATCH);
    const values = [];
    const tuples = batch.map((row, i) => {
        const base = i * COLUMNS.length;
        values.push(row.message_id, row.guild_id, row.channel_id, row.user_id, row.username, row.content, row.attachments, row.created_at);
        return `(${COLUMNS.map((_, j) => `$${base + j + 1}`).join(', ')})`;
    });

    try {
        await client.db.query(
            `INSERT INTO message_logs (${COLUMNS.join(', ')})
             VALUES ${tuples.join(', ')}
             ON CONFLICT (message_id) DO NOTHING`,
            values
        );

        // Drop only what we persisted; anything appended during the await stays.
        buffer.splice(0, batch.length);
    } catch (err) {
        logger.error('messageLogStore.flush failed; keeping batch for retry:', err);
    }
}

async function prune(client) {
    try {
        const { rowCount } = await client.db.query(
            `DELETE FROM message_logs WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`
        );
        if (rowCount) logger.info(`[messageLog] Pruned ${rowCount} expired message log(s)`);
    } catch (err) {
        logger.error('messageLogStore.prune failed:', err);
    }
}

async function ensureSchema(client) {
    await client.db.query(`
        CREATE TABLE IF NOT EXISTS message_logs (
            message_id  TEXT PRIMARY KEY,
            guild_id    TEXT NOT NULL,
            channel_id  TEXT NOT NULL,
            user_id     TEXT NOT NULL,
            username    TEXT,
            content     TEXT,
            attachments TEXT,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await client.db.query(
        `CREATE INDEX IF NOT EXISTS idx_message_logs_created_at ON message_logs (created_at)`
    );
}

export async function startMessageLogStore(client) {
    await ensureSchema(client);

    setInterval(() => {
        flush(client).catch(err => logger.error('[messageLog] flush tick error:', err));
    }, FLUSH_INTERVAL_MS);

    setInterval(() => {
        prune(client).catch(err => logger.error('[messageLog] prune tick error:', err));
    }, PRUNE_INTERVAL_MS);

    prune(client).catch(() => {}); // sweep once on boot

    logger.info(`[messageLog] Store started (flush ${FLUSH_INTERVAL_MS / 1000}s, retention ${RETENTION_DAYS}d)`);
}