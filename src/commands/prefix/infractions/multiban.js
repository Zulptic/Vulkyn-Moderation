import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { canPunishTarget } from '../../../services/permissionService.js';
import { errorService } from '../../../services/errorService.js';

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
        if (!args.length) return embedService.usage(message, 'multiban <id1,id2,...> [reason] [proof:evidence]  or  multiban <@user> <@user> [reason] [proof:evidence]', client);

        const { ids, rest } = parseUserArgs(args);
        if (!ids.length) return embedService.usage(message, 'multiban <id1,id2,...> [reason] [proof:evidence]  or  multiban <@user> <@user> [reason] [proof:evidence]', client);

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
            if (id === message.author.id) { failed.push({ id, reason: 'Cannot ban yourself' }); continue; }

            const user = await client.users.fetch(id).catch(() => null);
            if (!user) { failed.push({ id, reason: 'User not found' }); continue; }
            if (user.bot) { failed.push({ id, reason: 'Cannot ban a bot' }); continue; }

            const member = await message.guild.members.fetch(id).catch(() => null);
            if (member && !member.bannable) { failed.push({ id, reason: 'Missing permissions' }); continue; }

            const punishErr = canPunishTarget(message.member, member);
            if (punishErr) { failed.push({ id, reason: punishErr }); continue; }

            const banError = await message.guild.members.ban(id, { reason }).then(() => null).catch(err => err);
            if (banError) {
                await errorService.commandError(client, banError, message, 'multiban:ban', { targetId: id });
                failed.push({ id, reason: `Discord ban failed: ${banError.message}` });
                continue;
            }

            const logResult = await logModAction(client, {
                guildId: message.guild.id,
                action: 'ban',
                moderatorId: message.author.id,
                targetId: user.id,
                reason,
                proof,
            });
            const infraction = logResult?.infraction;

            if (!infraction) {
                await message.guild.members.unban(id, 'Ban logging failed; rolling back').catch(err =>
                    errorService.commandError(client, err, message, 'multiban:rollback-unban', { targetId: id })
                );
                failed.push({ id, reason: 'Infraction could not be recorded; ban was rolled back' });
                continue;
            }

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
            proof,
        });
    },
};
