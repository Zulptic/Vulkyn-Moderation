import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

export default {
    name: 'untimeout',
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove a timeout from a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to untimeout').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for removing the timeout'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (!target) {
            return embedService.error(interaction, 'User not found in this server.');
        }

        if (!target.communicationDisabledUntil) {
            return embedService.error(interaction, 'This user is not timed out.');
        }

        await interaction.deferReply({ flags: 64 });

        const { rows } = await client.db.query(
            `SELECT id, case_number FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'timeout' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [interaction.guild.id, target.id]
        );
        const originalInfractionId = rows[0]?.id;
        const originalCaseNumber = rows[0]?.case_number;

        const untimeoutError = await target.timeout(null, reason).then(() => null).catch(err => err);
        if (untimeoutError) {
            return embedService.error(interaction, `Untimeout failed: ${untimeoutError.message}`);
        }

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'timeout' AND active = true`,
            [interaction.guild.id, target.id]
        );

        const logResult = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'untimeout',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        if (!logResult?.modAction) {
            return embedService.error(interaction, 'Untimeout completed, but the moderation action could not be recorded.');
        }

        return embedService.modActionSuccess(interaction, {
            action: 'untimeout',
            targetId: target.id,
            caseNumber: originalCaseNumber,
            guildId: interaction.guild.id,
            reason,
        });
    },
};
