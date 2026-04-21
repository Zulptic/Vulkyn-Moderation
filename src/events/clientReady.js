import { logger } from '../utils/logger.js';

export default {
    name: 'clientReady',
    once: true,
    execute(client) {
        logger.info(`${client.user.tag} online — serving ${client.guilds.cache.size} guild(s)`);
    },
};