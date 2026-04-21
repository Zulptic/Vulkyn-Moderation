import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { Redis } from 'ioredis';
import pg from 'pg';
import { loadEvents } from './handlers/eventHandler.js';
import { loadCommands } from './handlers/commandHandler.js';
import { logger } from './utils/logger.js';

const { Pool } = pg;

const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS, 10) || 1;

function getShardId() {
    const hostname = process.env.HOSTNAME || '';
    const match = hostname.match(/-(\d+)$/);

    if (match) return parseInt(match[1], 10);
    if (process.env.SHARD_ID) return parseInt(process.env.SHARD_ID, 10);

    return 0;
}

const SHARD_ID = getShardId();

const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
    },
});

const redisSub = new Redis(process.env.REDIS_URL);

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error:', err));

const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

db.on('error', (err) => logger.error('PostgreSQL pool error:', err));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel],
    shards: SHARD_ID,
    shardCount: TOTAL_SHARDS,
});

client.redis = redis;
client.redisSub = redisSub;
client.db = db;
client.slashCommands = new Collection();
client.prefixCommands = new Collection();

redisSub.subscribe('config:update', (err) => {
    if (err) logger.error('Failed to subscribe to config:update:', err);
});

redisSub.on('message', async (channel, message) => {
    if (channel === 'config:update') {
        try {
            const { guildId } = JSON.parse(message);
            await redis.del(`guild:config:${guildId}`);
            logger.info(`Cache invalidated for guild ${guildId} (shard ${SHARD_ID})`);
        } catch (err) {
            logger.error('Error handling config update:', err);
        }
    }
});

async function start() {
    try {
        const dbClient = await db.connect();
        logger.info('PostgreSQL connected');
        dbClient.release();

        await loadCommands(client);
        await loadEvents(client);

        await client.login(process.env.DISCORD_TOKEN);
        logger.info(`Shard ${SHARD_ID}/${TOTAL_SHARDS - 1} logged in`);
    } catch (err) {
        logger.error('Failed to start:', err);
        process.exit(1);
    }
}

async function shutdown(signal) {
    logger.info(`${signal} received — shutting down shard ${SHARD_ID}`);

    client.destroy();
    redisSub.disconnect();
    await redis.quit();
    await db.end();

    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();