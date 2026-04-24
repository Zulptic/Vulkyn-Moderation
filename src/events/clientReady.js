import { logger } from '../utils/logger.js';
import { startMuteExpiry } from '../services/muteExpiry.js';
import {startBanExpiry} from "../services/banExpiry.js";

export default {
    name: 'clientReady',
    once: true,
    async execute(client) {
        logger.info(`${client.user.tag} online — serving ${client.guilds.cache.size} guild(s)`);

        for (const [guildId] of client.guilds.cache) {
            await client.syncGuildCommands(guildId, client);
        }

        startMuteExpiry(client);
        startBanExpiry(client);
    },
};