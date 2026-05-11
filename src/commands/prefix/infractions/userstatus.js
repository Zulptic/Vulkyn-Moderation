import { embedService } from '../../../services/embedService.js';
import { getScore } from '../../../services/accountStatusService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

export default {
    name: 'userstatus',
    async execute(message, args, client) {
        let target = message.mentions.users.first() ?? null;

        if (!target && args[0]) {
            target = await client.users.fetch(args[0]).catch(() => null);
            if (!target) return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (!target) target = message.author;

        const config = await getGuildConfig(message.guild.id, client);
        const asConfig = config?.accountStatus ?? {};

        if (!asConfig.enabled) {
            return embedService.error(message, 'Account Status is disabled in the config!');
        }

        const statusData = await getScore(client, message.guild.id, target.id);

        return embedService.accountStatusInfo(message, {
            user: target,
            statusData,
            asConfig,
        });
    },
};
