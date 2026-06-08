import { logger } from '../utils/logger.js';
import { startPunishmentExpiryScheduler } from '../services/punishmentExpiry.js';
import { startAccountStatusRefresh } from '../services/accountStatusService.js';

export default {
    name: 'clientReady',
    once: true,
    async execute(client) {
        logger.info(`${client.user.tag} online — serving ${client.guilds.cache.size} guild(s)`);

        for (const [guildId] of client.guilds.cache) {
            await client.syncGuildCommands(guildId, client);
        }

        startPunishmentExpiryScheduler(client);
        startAccountStatusRefresh(client);
    },
};