import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { errorService } from '../../../services/errorService.js';
import { logModAction } from '../../../services/moderationService.js';

export default {
    name: 'unban',
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user')
        .addStringOption(opt => opt.setName('user').setDescription('User ID to unban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the unban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction, client) {
        const userId = interaction.options.getString('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
        if (!ban) {
            return embedService.error(interaction, 'That user is not banned.');
        }

        await interaction.deferReply({ flags: 64 });

        const { rows } = await client.db.query(
            `SELECT id, case_number FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'ban' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [interaction.guild.id, userId]
        );
        const originalInfractionId = rows[0]?.id;
        const originalCaseNumber = rows[0]?.case_number;

        const unbanError = await interaction.guild.members.unban(userId, reason).then(() => null).catch(err => err);
        if (unbanError) {
            await errorService.commandError(client, unbanError, interaction, 'unban', { targetId: userId });
            return embedService.error(interaction, `Unban failed: ${unbanError.message}`);
        }

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'ban' AND active = true`,
            [interaction.guild.id, userId]
        );

        const logResult = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'unban',
            moderatorId: interaction.user.id,
            targetId: userId,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        if (!logResult?.modAction) {
            return embedService.error(interaction, 'Unban completed, but the moderation action could not be recorded.');
        }

        return embedService.modActionSuccess(interaction, {
            action: 'unban',
            targetId: userId,
            caseNumber: originalCaseNumber,
            guildId: interaction.guild.id,
            reason,
        });
    },
};
