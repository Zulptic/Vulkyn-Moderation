import { logger } from '../utils/logger.js';

const DEFAULT_CONFIG = {
    commandMode: 'both',
    prefix: '!',
    disabledCommands: [],
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

            await client.syncGuildCommands(guild.id, client);
        } catch (err) {
            logger.error(`Failed to create config for guild ${guild.id}:`, err);
        }
    },
};