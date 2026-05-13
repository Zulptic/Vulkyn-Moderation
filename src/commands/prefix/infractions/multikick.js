import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { canPunishTarget } from '../../../services/permissionService.js';

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
    name: 'multikick',
    async execute(message, args, client) {
        if (!args.length) return embedService.usage(message, 'multikick <id1,id2,...> [reason] [proof:evidence]  or  multikick <@user> <@user> [reason] [proof:evidence]', client);

        const { ids, rest } = parseUserArgs(args);
        if (!ids.length) return embedService.usage(message, 'multikick <id1,id2,...> [reason] [proof:evidence]  or  multikick <@user> <@user> [reason] [proof:evidence]', client);

        let reasonArgs = rest;
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
            if (id === message.author.id) { failed.push({ id, reason: 'Cannot kick yourself' }); continue; }

            const member = await message.guild.members.fetch(id).catch(() => null);
            if (!member) { failed.push({ id, reason: 'Not found in server' }); continue; }
            if (member.user.bot) { failed.push({ id, reason: 'Cannot kick a bot' }); continue; }
            if (!member.kickable) { failed.push({ id, reason: 'Missing permissions' }); continue; }

            const punishErr = canPunishTarget(message.member, member);
            if (punishErr) { failed.push({ id, reason: punishErr }); continue; }

            const { infraction } = await logModAction(client, {
                guildId: message.guild.id,
                action: 'kick',
                moderatorId: message.author.id,
                targetId: member.id,
                reason,
                proof,
            });

            await member.kick(reason);
            actioned.push({ userId: member.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(message, `No users were kicked.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(message, {
            action: 'kick',
            actioned,
            failed,
            guildId: message.guild.id,
            reason,
            proof,
        });
    },
};
