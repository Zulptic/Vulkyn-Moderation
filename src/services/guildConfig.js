import { logger } from '../utils/logger.js';

const CACHE_TTL = 300;

export async function getGuildConfig(guildId, client) {
    const cacheKey = `guild:config:${guildId}`;

    try {
        const cached = await client.redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
    } catch (err) {
        logger.warn(`Redis cache read failed for guild ${guildId}:`, err);
    }

    try {
        const { rows } = await client.db.query(
            'SELECT config FROM guild_configs WHERE guild_id = $1',
            [guildId]
        );

        const config = rows[0]?.config || { prefix: '!' };

        await client.redis.set(cacheKey, JSON.stringify(config), 'EX', CACHE_TTL).catch(() => {});

        return config;
    } catch (err) {
        logger.error(`Failed to fetch config for guild ${guildId}:`, err);
        return { prefix: '!' };
    }
}

export async function updateGuildConfig(guildId, config, client) {
    try {
        await client.db.query(
            `INSERT INTO guild_configs (guild_id, config)
       VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET config = $2, updated_at = NOW()`,
            [guildId, JSON.stringify(config)]
        );

        await client.redis.del(`guild:config:${guildId}`);
        await client.redis.publish('config:update', JSON.stringify({ guildId }));

        return true;
    } catch (err) {
        logger.error(`Failed to update config for guild ${guildId}:`, err);
        return false;
    }
}