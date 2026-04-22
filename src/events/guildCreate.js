import { logger } from '../utils/logger.js';

const DEFAULT_CONFIG = {
    prefix: '!',
    automod: {
        enabled: false,
        low: { action: 'notify', channel: null },
        medium: { action: 'review', channel: null },
        high: { action: 'mute', duration: 3600, channel: null },
        weights: {
            hate: 2.0,
            violence: 2.0,
            sexual: 1.5,
            selfHarm: 1.5,
            harassment: 1.0,
        },
    },
    accountStatus: {
        enabled: false,
        permanent: true,
        resetInterval: null,
        thresholds: {},
        weights: {
            aiFlag: 1.0,
            mute: 1.5,
            warn: 1.0,
            kick: 2.0,
            ban: 3.0,
        },
    },
    modLog: {
        channel: null,
    },
};

export default {
    name: 'guildCreate',
    async execute(guild, client) {
        try {
            await client.db.query(
                `INSERT INTO guild_configs (guild_id, guild_name, config)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (guild_id) DO UPDATE SET guild_name = $2, updated_at = NOW()`,
                [guild.id, guild.name, JSON.stringify(DEFAULT_CONFIG)]
            );

            logger.info(`Joined guild: ${guild.name} (${guild.id}) — config created`);
        } catch (err) {
            logger.error(`Failed to create config for guild ${guild.id}:`, err);
        }
    },
};