import { embedService } from '../../../services/embedService.js';
import { setScore } from '../../../services/accountStatusService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

export default {
    name: 'setuserstatus',
    async execute(message, args, client) {
        let target = message.mentions.users.first() ?? null;

        if (!target && args[0]) {
            target = await client.users.fetch(args[0]).catch(() => null);
            if (!target) return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (!target) return embedService.usage(message, 'setuserstatus <user> <score>', client);

        const score = parseInt(args[1], 10);
        if (isNaN(score) || score < 0) {
            return embedService.error(message, 'Please provide a valid score (0 or higher).');
        }

        const config = await getGuildConfig(message.guild.id, client);
        const asConfig = config?.accountStatus ?? {};

        if (!asConfig.enabled) {
            return embedService.error(message, 'Account Status is disabled in the config!');
        }

        await setScore(client, message.guild.id, target.id, score);

        return embedService.success(message, `Set account status score for <@${target.id}> to **${score}**.`);
    },
};
