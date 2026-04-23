import { logger } from '../utils/logger.js';

const DEFAULT_CONFIG = {
    commandMode: 'both',
    prefix: '!',
    disabledCommands: [],
    permissions: {
        manageBot: [],
        commandRules: [],
    },
    modLog: {
        channel: null,
        dmOnWarn: true,
        dmOnMute: true,
        dmOnKick: true,
        dmOnBan: true,
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

            // Sync slash commands based on config
            await client.syncGuildCommands(guild.id, client);
        } catch (err) {
            logger.error(`Failed to create config for guild ${guild.id}:`, err);
        }
    },
};