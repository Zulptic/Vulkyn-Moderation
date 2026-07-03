import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { canPunishTarget } from '../../../services/permissionService.js';
import { errorService } from '../../../services/errorService.js';

function extractIds(str) {
    return [...str.matchAll(/\d{17,20}/g)].map(m => m[0]);
}

export default {
    name: 'multiban',
    data: new SlashCommandBuilder()
        .setName('multiban')
        .setDescription('Ban multiple users at once')
        .addStringOption(opt =>
            opt.setName('users').setDescription('Comma-separated IDs or @mentions').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('reason').setDescription('Reason for the bans')
        )
        .addStringOption(opt =>
            opt.setName('proof').setDescription('Evidence for this action (link or text)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction, client) {
        const ids = extractIds(interaction.options.getString('users'));
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const proof = interaction.options.getString('proof') || null;

        if (!ids.length) return embedService.error(interaction, 'Please provide at least one valid user ID or mention.');

        await interaction.deferReply({ flags: 64 });

        const actioned = [];
        const failed = [];

        for (const id of ids) {
            if (id === interaction.user.id) { failed.push({ id, reason: 'Cannot ban yourself' }); continue; }

            const user = await client.users.fetch(id).catch(() => null);
            if (!user) { failed.push({ id, reason: 'User not found' }); continue; }
            if (user.bot) { failed.push({ id, reason: 'Cannot ban a bot' }); continue; }

            const member = await interaction.guild.members.fetch(id).catch(() => null);
            if (member && !member.bannable) { failed.push({ id, reason: 'Missing permissions' }); continue; }

            const punishErr = canPunishTarget(interaction.member, member);
            if (punishErr) { failed.push({ id, reason: punishErr }); continue; }

            const banError = await interaction.guild.members.ban(id, { reason }).then(() => null).catch(err => err);
            if (banError) {
                await errorService.commandError(client, banError, interaction, 'multiban:ban', { targetId: id });
                failed.push({ id, reason: `Discord ban failed: ${banError.message}` });
                continue;
            }

            const logResult = await logModAction(client, {
                guildId: interaction.guild.id,
                action: 'ban',
                moderatorId: interaction.user.id,
                targetId: user.id,
                reason,
                proof,
            });
            const infraction = logResult?.infraction;

            if (!infraction) {
                await interaction.guild.members.unban(id, 'Ban logging failed; rolling back').catch(err =>
                    errorService.commandError(client, err, interaction, 'multiban:rollback-unban', { targetId: id })
                );
                failed.push({ id, reason: 'Infraction could not be recorded; ban was rolled back' });
                continue;
            }

            actioned.push({ userId: user.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(interaction, `No users were banned.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(interaction, {
            action: 'ban',
            actioned,
            failed,
            guildId: interaction.guild.id,
            reason,
            proof,
        });
    },
};
