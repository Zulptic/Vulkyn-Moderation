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
            `SELECT id FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'timeout' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [interaction.guild.id, target.id]
        );
        const originalInfractionId = rows[0]?.id;

        await target.timeout(null, reason);

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'timeout' AND active = true`,
            [interaction.guild.id, target.id]
        );

        await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'untimeout',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        return embedService.modActionSuccess(interaction, {
            action: 'untimeout',
            targetId: target.id,
            caseNumber: originalInfractionId,
            guildId: interaction.guild.id,
            reason,
        });
    },
};
