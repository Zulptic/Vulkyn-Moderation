import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";
import { canPunishTarget } from "../../../services/permissionService.js";
import { scheduleInfractionExpiry } from "../../../services/punishmentExpiry.js";
import { errorService } from "../../../services/errorService.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str.match(DURATION_REGEX);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    return num * multipliers[unit];
}

export default {
    name: 'mute',
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'mute <targetID> [duration] <Reason> [proof:evidence]', client);
        }

        const config = await getGuildConfig(message.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            await errorService.commandWarning(client, message, {
                code: 'MUTE_ROLE_NOT_CONFIGURED',
                operation: 'mute',
                message: 'Server Mute role is not configured.',
            });
            return embedService.error(message, 'Server Mute role is not configured. Please re-invite the bot or set it up in the web panel.');
        }

        const muteRole = message.guild.roles.cache.get(muteRoleId);
        if (!muteRole) {
            await errorService.commandWarning(client, message, {
                code: 'MUTE_ROLE_UNAVAILABLE',
                operation: 'mute',
                message: `Configured Server Mute role ${muteRoleId} is unavailable.`,
                context: { muteRoleId },
            });
            return embedService.error(message, 'Server Mute role was deleted. Please re-invite the bot or set it up in the web panel.');
        }

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (target.user.bot) {
            return embedService.error(message, 'You cannot mute a bot.');
        }

        if (target.id === message.author.id) {
            return embedService.error(message, 'You cannot mute yourself.');
        }

        if (target.roles.cache.has(muteRoleId)) {
            return embedService.error(message, 'This user is already muted.');
        }

        const punishErr = canPunishTarget(message.member, target);
        if (punishErr) return embedService.error(message, punishErr);

        let reasonArgs = args.slice(1);
        let duration = null;

        // Check for optional duration
        if (reasonArgs[0] && DURATION_REGEX.test(reasonArgs[0])) {
            duration = parseDuration(reasonArgs[0]);
            reasonArgs = reasonArgs.slice(1);
        }

        const proofIdx = reasonArgs.findIndex(a => a.toLowerCase().startsWith('proof:'));
        let proof = null;
        if (proofIdx !== -1) {
            proof = reasonArgs[proofIdx].slice(6) || null;
            reasonArgs = reasonArgs.filter((_, i) => i !== proofIdx);
        }
        const reason = reasonArgs.join(' ') || 'No reason provided';

        const muteError = await target.roles.add(muteRole, reason).then(() => null).catch(err => err);
        if (muteError) {
            await errorService.commandError(client, muteError, message, 'mute:add-role', { targetId: target.id, muteRoleId });
            return embedService.error(message, `Mute failed: ${muteError.message}`);
        }

        const logResult = await logModAction(client, {
            guildId: message.guild.id,
            action: 'mute',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
            duration,
            proof,
        });
        const infraction = logResult?.infraction;

        if (!infraction) {
            await target.roles.remove(muteRole, 'Mute logging failed; rolling back').catch(err =>
                errorService.commandError(client, err, message, 'mute:rollback-role', { targetId: target.id, muteRoleId })
            );
            return embedService.error(message, 'Mute failed because the infraction could not be recorded. The mute role was removed.');
        }

        if (duration && infraction?.expires_at) {
            scheduleInfractionExpiry(client, infraction);
        }

        return embedService.modActionSuccess(message, {
            action: 'mute',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: message.guild.id,
            reason,
            duration: duration ? args[1] : 'Permanent',
            proof,
        });
    },
}
