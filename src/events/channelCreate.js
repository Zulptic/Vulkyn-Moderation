import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { errorService } from '../services/errorService.js';

export default {
    name: 'channelCreate',
    async execute(channel, client) {
        if (!channel.guild) return;

        const config = await getGuildConfig(channel.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) return;

        const muteRole = channel.guild.roles.cache.get(muteRoleId);
        if (!muteRole) return;

        try {
            await channel.permissionOverwrites.create(muteRole, {
                SendMessages: false,
                AddReactions: false,
                Speak: false,
                Connect: false,
            });

            logger.info(`Applied mute overrides to new channel #${channel.name} in ${channel.guild.name}`);
        } catch (err) {
            logger.warn(`Could not apply mute overrides to #${channel.name}:`, err);
            await errorService.warning(client, {
                guildId: channel.guild.id,
                code: 'MUTE_CHANNEL_OVERWRITE_FAILED',
                source: 'channel-create-event',
                operation: 'apply-mute-overwrite',
                message: `Could not apply mute-role overwrites to channel ${channel.id}: ${err.message}`,
                stackTrace: err.stack,
                context: {
                    channelId: channel.id,
                    muteRoleId,
                    discordCode: err.code,
                },
            });
        }
    },
};
