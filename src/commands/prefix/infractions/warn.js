import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { canPunishTarget } from "../../../services/permissionService.js";

export default {
    name: 'warn',
    async execute(message, args, client) {
        if (!args.length) return embedService.usage(message, 'warn <targetID> <Reason> [proof:evidence]', client);

        const target =
            message.mentions.members.first() ||
            await message.guild.members.fetch(args[0]).catch(() => null);

        if (!target) return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        if (target.user.bot) return embedService.error(message, 'You cannot warn a bot.');
        //if (target.id === message.author.id) return embedService.error(message, 'You cannot warn yourself.');

        const punishErr = canPunishTarget(message.member, target);
        if (punishErr) return embedService.error(message, punishErr);

        let reasonArgs = args.slice(1);
        const proofIdx = reasonArgs.findIndex(a => a.toLowerCase().startsWith('proof:'));
        let proof = null;
        if (proofIdx !== -1) {
            proof = reasonArgs[proofIdx].slice(6) || null;
            reasonArgs = reasonArgs.filter((_, i) => i !== proofIdx);
        }
        const reason = reasonArgs.join(' ') || 'No reason provided';

        const { infraction } = await logModAction(client, {
            guildId: message.guild.id,
            action: 'warn',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
            proof,
        });

        return embedService.modActionSuccess(message, {
            action: 'warn',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: message.guild.id,
            reason,
            proof,
        });
    },
};