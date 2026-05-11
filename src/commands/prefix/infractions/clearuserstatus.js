import { embedService } from '../../../services/embedService.js';
import { clearScore } from '../../../services/accountStatusService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

export default {
    name: 'clearuserstatus',
    async execute(message, args, client) {
        let target = message.mentions.users.first() ?? null;

        if (!target && args[0]) {
            target = await client.users.fetch(args[0]).catch(() => null);
            if (!target) return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (!target) return embedService.usage(message, 'clearuserstatus <user>', client);

        const config = await getGuildConfig(message.guild.id, client);
        const asConfig = config?.accountStatus ?? {};

        if (!asConfig.enabled) {
            return embedService.error(message, 'Account Status is disabled in the config!');
        }

        const cleared = await clearScore(client, message.guild.id, target.id);

        if (!cleared) {
            return embedService.error(message, 'That user has no Account Status.');
        }

        return embedService.success(message, `Cleared account status for <@${target.id}>.`);
    },
};