import { SlashCommandBuilder } from "discord.js";
import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";
import { logModAction } from "../../../services/moderationService.js";

export default {
    name: 'unmute',
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the unmute')),
    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const config = await getGuildConfig(interaction.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            return embedService.error(interaction, 'Server Mute role is not configured.');
        }

        if (!target) {
            return embedService.error(interaction, 'User not found in this server.');
        }

        if (!target.roles.cache.has(muteRoleId)) {
            return embedService.error(interaction, 'This user is not muted.');
        }

        const { rows } = await client.db.query(
            `SELECT id, case_number FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [interaction.guild.id, target.id]
        );
        const originalInfractionId = rows[0]?.id;
        const originalCaseNumber = rows[0]?.case_number;

        await interaction.deferReply({ flags: 64 });

        const unmuteError = await target.roles.remove(muteRoleId, reason).then(() => null).catch(err => err);
        if (unmuteError) {
            return embedService.error(interaction, `Unmute failed: ${unmuteError.message}`);
        }

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true`,
            [interaction.guild.id, target.id]
        );

        const logResult = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'unmute',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        if (!logResult?.modAction) {
            return embedService.error(interaction, 'Unmute completed, but the moderation action could not be recorded.');
        }

        return embedService.modActionSuccess(interaction, {
            action: 'unmute',
            targetId: target.id,
            caseNumber: originalCaseNumber,
            guildId: interaction.guild.id,
            reason,
        });
    }
}
