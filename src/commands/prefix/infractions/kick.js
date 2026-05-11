import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

export default {
    name: 'kick',
    async execute(message, args, client) {
        if (!args.length) return embedService.usage(message, 'kick <targetID> <Reason>', client);

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        if (target.user.bot) return embedService.error(message, 'You cannot kick a bot.');
        if (target.id === message.author.id) return embedService.error(message, 'You cannot kick yourself.');
        if (!target.kickable) return embedService.error(message, 'I cannot kick this user. They may have a higher role than mine.');

        const reason = args.slice(1).join(' ') || 'No reason provided.';

        const { infraction } = await logModAction(client, {
            guildId: message.guild.id,
            action: 'kick',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
        });

        await target.kick(reason);

        return embedService.modActionSuccess(message, {
            action: 'kick',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: message.guild.id,
            reason,
        });
    },
}