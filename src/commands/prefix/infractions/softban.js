import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

export default {
    name: 'softban',
    async execute(message, args, client) {
        if (!args.length) return embedService.usage(message, 'softban <targetID> [reason]', client);

        const target = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
        if (!target) return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        if (target.bot) return embedService.error(message, 'You cannot softban a bot.');
        if (target.id === message.author.id) return embedService.error(message, 'You cannot softban yourself.');

        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (member && !member.bannable) {
            return embedService.error(message, 'I cannot softban this user. They may have a higher role than me.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        const { infraction } = await logModAction(client, {
            guildId: message.guild.id,
            action: 'softban',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
        });

        await message.guild.members.ban(target.id, { reason, deleteMessageSeconds: 86400 });
        await message.guild.members.unban(target.id, 'softban — message purge complete');

        return embedService.modActionSuccess(message, {
            action: 'softban',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: message.guild.id,
            reason,
        });
    },
};
