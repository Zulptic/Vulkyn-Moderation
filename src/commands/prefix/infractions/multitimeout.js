import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

const DURATION_REGEX = /^(\d+)(s|m|h|d)$/;

function parseDuration(str) {
    const match = str?.match(DURATION_REGEX);
    if (!match) return null;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(match[1]) * multipliers[match[2]];
}

function extractIds(str) {
    return [...str.matchAll(/\d{17,20}/g)].map(m => m[0]);
}

function parseUserArgs(args) {
    if (args[0]?.includes(',')) {
        return { ids: extractIds(args[0]), rest: args.slice(1) };
    }
    let i = 0;
    while (i < args.length && /^(<@!?\d{17,20}>|\d{17,20})$/.test(args[i])) i++;
    return { ids: args.slice(0, i).flatMap(a => extractIds(a)), rest: args.slice(i) };
}

export default {
    name: 'multitimeout',
    async execute(message, args, client) {
        if (args.length < 2) return embedService.usage(message, 'multitimeout <id1,id2,...> <duration> [reason]  or  multitimeout <@user> <@user> <duration> [reason]', client);

        const { ids, rest } = parseUserArgs(args);
        if (!ids.length || !rest.length) return embedService.usage(message, 'multitimeout <id1,id2,...> <duration> [reason]  or  multitimeout <@user> <@user> <duration> [reason]', client);

        const durationStr = rest[0];
        const duration = parseDuration(durationStr);
        if (!duration) return embedService.error(message, 'Invalid duration format (e.g. `5m`, `1h`, `7d`).');
        if (duration > 2419200) return embedService.error(message, 'Timeout duration cannot exceed 28 days.');

        const reason = rest.slice(1).join(' ') || 'No reason provided';
        const actioned = [];
        const failed = [];

        for (const id of ids) {
            if (id === message.author.id) { failed.push({ id, reason: 'Cannot timeout yourself' }); continue; }

            const member = await message.guild.members.fetch(id).catch(() => null);
            if (!member) { failed.push({ id, reason: 'Not found in server' }); continue; }
            if (member.user.bot) { failed.push({ id, reason: 'Cannot timeout a bot' }); continue; }
            if (!member.moderatable) { failed.push({ id, reason: 'Missing permissions' }); continue; }

            await member.timeout(duration * 1000, reason);

            const { infraction } = await logModAction(client, {
                guildId: message.guild.id,
                action: 'timeout',
                moderatorId: message.author.id,
                targetId: member.id,
                reason,
                duration,
            });

            actioned.push({ userId: member.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(message, `No users were timed out.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(message, {
            action: 'timeout',
            actioned,
            failed,
            guildId: message.guild.id,
            reason,
            duration: durationStr,
        });
    },
};
