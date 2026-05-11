import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

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
    name: 'multiban',
    async execute(message, args, client) {
        if (!args.length) return embedService.usage(message, 'multiban <id1,id2,...> [reason]  or  multiban <@user> <@user> [reason]', client);

        const { ids, rest } = parseUserArgs(args);
        if (!ids.length) return embedService.usage(message, 'multiban <id1,id2,...> [reason]  or  multiban <@user> <@user> [reason]', client);

        const reason = rest.join(' ') || 'No reason provided';
        const actioned = [];
        const failed = [];

        for (const id of ids) {
            if (id === message.author.id) { failed.push({ id, reason: 'Cannot ban yourself' }); continue; }

            const user = await client.users.fetch(id).catch(() => null);
            if (!user) { failed.push({ id, reason: 'User not found' }); continue; }
            if (user.bot) { failed.push({ id, reason: 'Cannot ban a bot' }); continue; }

            const member = await message.guild.members.fetch(id).catch(() => null);
            if (member && !member.bannable) { failed.push({ id, reason: 'Missing permissions' }); continue; }

            const { infraction } = await logModAction(client, {
                guildId: message.guild.id,
                action: 'ban',
                moderatorId: message.author.id,
                targetId: user.id,
                reason,
            });

            await message.guild.members.ban(id, { reason });
            actioned.push({ userId: user.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(message, `No users were banned.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(message, {
            action: 'ban',
            actioned,
            failed,
            guildId: message.guild.id,
            reason,
        });
    },
};
