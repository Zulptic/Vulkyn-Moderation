import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str.match(DURATION_REGEX);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    return num * multipliers[unit];
}

function parsePurgeDuration(str) {
    const parsed = parseDuration(str);
    if (parsed === null || parsed > 604800) return null;
    return parsed;
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
}

export default {
    name: 'ban',
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'ban <targetID> [duration] [purge:duration] <Reason> [proof:evidence]', client);
        }

        const target = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (target.bot) {
            return embedService.error(message, 'You cannot ban a bot.');
        }

        if (target.id === message.author.id) {
            return embedService.error(message, 'You cannot ban yourself.');
        }

        const member = await message.guild.members.fetch(target.id).catch(() => null);
        if (member && !member.bannable) {
            return embedService.error(message, 'I cannot ban this user. They may have a higher role than me.');
        }

        let reasonArgs = args.slice(1);
        let duration = null;
        let deleteMessageSeconds = 0;

        if (reasonArgs[0] && DURATION_REGEX.test(reasonArgs[0]) && !reasonArgs[0].startsWith('purge:')) {
            duration = parseDuration(reasonArgs[0]);
            reasonArgs = reasonArgs.slice(1);
        }

        if (reasonArgs[0] && reasonArgs[0].toLowerCase().startsWith('purge:')) {
            const purgeValue = reasonArgs[0].split(':')[1];
            const parsed = parsePurgeDuration(purgeValue);
            if (parsed === null) {
                return embedService.error(message, 'Invalid purge duration. Max is 7 days (e.g. `purge:30m`, `purge:6h`, `purge:3d`, `purge:1w`).');
            }
            deleteMessageSeconds = parsed;
            reasonArgs = reasonArgs.slice(1);
        }

        const proofIdx = reasonArgs.findIndex(a => a.toLowerCase().startsWith('proof:'));
        let proof = null;
        if (proofIdx !== -1) {
            proof = reasonArgs[proofIdx].slice(6) || null;
            reasonArgs = reasonArgs.filter((_, i) => i !== proofIdx);
        }
        const reason = reasonArgs.join(' ') || 'No reason provided';

        const { infraction } = await logModAction(client, {
            guildId: message.guild.id,
            action: 'ban',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
            duration,
            proof,
            metadata: {
                deleteMessageSeconds,
            },
        });

        await message.guild.members.ban(target.id, {
            reason,
            deleteMessageSeconds,
        });

        return embedService.modActionSuccess(message, {
            action: 'ban',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: message.guild.id,
            reason,
            duration: duration ? formatDuration(duration) : 'Permanent',
            purged: deleteMessageSeconds > 0 ? `${formatDuration(deleteMessageSeconds)} of messages` : null,
            proof,
        });
    }
}