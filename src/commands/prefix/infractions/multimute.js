import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str?.match(DURATION_REGEX);
    if (!match) return null;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
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
    name: 'multimute',
    async execute(message, args, client) {
        if (!args.length) return embedService.usage(message, 'multimute <id1,id2,...> [duration] [reason] [proof:evidence]  or  multimute <@user> <@user> [duration] [reason] [proof:evidence]', client);

        const { ids, rest } = parseUserArgs(args);
        if (!ids.length) return embedService.usage(message, 'multimute <id1,id2,...> [duration] [reason] [proof:evidence]  or  multimute <@user> <@user> [duration] [reason] [proof:evidence]', client);

        const config = await getGuildConfig(message.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) return embedService.error(message, 'Server Mute role is not configured.');

        const muteRole = message.guild.roles.cache.get(muteRoleId);
        if (!muteRole) return embedService.error(message, 'Server Mute role was deleted.');

        let reasonArgs = rest;
        let duration = null;
        let durationStr = null;

        if (reasonArgs[0] && DURATION_REGEX.test(reasonArgs[0])) {
            durationStr = reasonArgs[0];
            duration = parseDuration(durationStr);
            reasonArgs = reasonArgs.slice(1);
        }

        const proofIdx = reasonArgs.findIndex(a => a.toLowerCase().startsWith('proof:'));
        let proof = null;
        if (proofIdx !== -1) {
            proof = reasonArgs[proofIdx].slice(6) || null;
            reasonArgs = reasonArgs.filter((_, i) => i !== proofIdx);
        }
        const reason = reasonArgs.join(' ') || 'No reason provided';
        const actioned = [];
        const failed = [];

        for (const id of ids) {
            if (id === message.author.id) { failed.push({ id, reason: 'Cannot mute yourself' }); continue; }

            const member = await message.guild.members.fetch(id).catch(() => null);
            if (!member) { failed.push({ id, reason: 'Not found in server' }); continue; }
            if (member.user.bot) { failed.push({ id, reason: 'Cannot mute a bot' }); continue; }
            if (member.roles.cache.has(muteRoleId)) { failed.push({ id, reason: 'Already muted' }); continue; }

            await member.roles.add(muteRole, reason);

            const { infraction } = await logModAction(client, {
                guildId: message.guild.id,
                action: 'mute',
                moderatorId: message.author.id,
                targetId: member.id,
                reason,
                duration,
                proof,
            });

            actioned.push({ userId: member.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(message, `No users were muted.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(message, {
            action: 'mute',
            actioned,
            failed,
            guildId: message.guild.id,
            reason,
            duration: durationStr ?? 'Permanent',
            proof,
        });
    },
};
