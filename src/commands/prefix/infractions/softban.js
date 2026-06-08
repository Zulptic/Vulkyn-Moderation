import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { canPunishTarget } from '../../../services/permissionService.js';

export default {
    name: 'softban',
    async execute(message, args, client) {
        if (!args.length) return embedService.usage(message, 'softban <targetID> [reason] [proof:evidence]', client);

        const target = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
        if (!target) return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        if (target.bot) return embedService.error(message, 'You cannot softban a bot.');
        if (target.id === message.author.id) return embedService.error(message, 'You cannot softban yourself.');

        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (member && !member.bannable) {
            return embedService.error(message, 'I cannot softban this user. They may have a higher role than me.');
        }

        const punishErr = canPunishTarget(message.member, member);
        if (punishErr) return embedService.error(message, punishErr);

        let reasonArgs = args.slice(1);
        const proofIdx = reasonArgs.findIndex(a => a.toLowerCase().startsWith('proof:'));
        let proof = null;
        if (proofIdx !== -1) {
            proof = reasonArgs[proofIdx].slice(6) || null;
            reasonArgs = reasonArgs.filter((_, i) => i !== proofIdx);
        }
        const reason = reasonArgs.join(' ') || 'No reason provided';

        const banError = await message.guild.members.ban(target.id, {
            reason,
            deleteMessageSeconds: 86400,
        }).then(() => null).catch(err => err);

        if (banError) {
            return embedService.error(message, `Softban failed during ban step: ${banError.message}`);
        }

        const unbanError = await message.guild.members.unban(target.id, 'softban — message purge complete')
            .then(() => null)
            .catch(err => err);

        if (unbanError) {
            return embedService.error(message, `Softban failed during unban step: ${unbanError.message}`);
        }

        const logResult = await logModAction(client, {
            guildId: message.guild.id,
            action: 'softban',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
            proof,
        });
        const infraction = logResult?.infraction;

        if (!infraction) {
            return embedService.error(message, 'Softban completed, but the infraction could not be recorded.');
        }

        return embedService.modActionSuccess(message, {
            action: 'softban',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: message.guild.id,
            reason,
            proof,
        });
    },
};
