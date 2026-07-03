import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { canPunishTarget } from '../../../services/permissionService.js';
import { errorService } from '../../../services/errorService.js';

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

export default {
    name: 'multitimeout',
    data: new SlashCommandBuilder()
        .setName('multitimeout')
        .setDescription('Timeout multiple users at once')
        .addStringOption(opt =>
            opt.setName('users').setDescription('Comma-separated IDs or @mentions').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('duration').setDescription('Duration (e.g. 5m, 1h, 7d)').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('reason').setDescription('Reason for the timeouts')
        )
        .addStringOption(opt =>
            opt.setName('proof').setDescription('Evidence for this action (link or text)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction, client) {
        const ids = extractIds(interaction.options.getString('users'));
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const proof = interaction.options.getString('proof') || null;

        if (!ids.length) return embedService.error(interaction, 'Please provide at least one valid user ID or mention.');

        const duration = parseDuration(durationStr);
        if (!duration) return embedService.error(interaction, 'Invalid duration format (e.g. `5m`, `1h`, `7d`).');
        if (duration > 2419200) return embedService.error(interaction, 'Timeout duration cannot exceed 28 days.');

        await interaction.deferReply({ flags: 64 });

        const actioned = [];
        const failed = [];

        for (const id of ids) {
            if (id === interaction.user.id) { failed.push({ id, reason: 'Cannot timeout yourself' }); continue; }

            const member = await interaction.guild.members.fetch(id).catch(() => null);
            if (!member) { failed.push({ id, reason: 'Not found in server' }); continue; }
            if (member.user.bot) { failed.push({ id, reason: 'Cannot timeout a bot' }); continue; }
            if (!member.moderatable) { failed.push({ id, reason: 'Missing permissions' }); continue; }

            const punishErr = canPunishTarget(interaction.member, member);
            if (punishErr) { failed.push({ id, reason: punishErr }); continue; }

            const timeoutError = await member.timeout(duration * 1000, reason).then(() => null).catch(err => err);
            if (timeoutError) {
                await errorService.commandError(client, timeoutError, interaction, 'multitimeout:timeout', { targetId: id });
                failed.push({ id, reason: `Discord timeout failed: ${timeoutError.message}` });
                continue;
            }

            const logResult = await logModAction(client, {
                guildId: interaction.guild.id,
                action: 'timeout',
                moderatorId: interaction.user.id,
                targetId: member.id,
                reason,
                duration,
                proof,
            });
            const infraction = logResult?.infraction;

            if (!infraction) {
                await member.timeout(null, 'Timeout logging failed; rolling back').catch(err =>
                    errorService.commandError(client, err, interaction, 'multitimeout:rollback', { targetId: id })
                );
                failed.push({ id, reason: 'Infraction could not be recorded; timeout was rolled back' });
                continue;
            }

            actioned.push({ userId: member.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(interaction, `No users were timed out.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(interaction, {
            action: 'timeout',
            actioned,
            failed,
            guildId: interaction.guild.id,
            reason,
            duration: durationStr,
            proof,
        });
    },
};
