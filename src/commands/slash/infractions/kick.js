import { SlashCommandBuilder } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

export default {
    name: 'kick',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick')),

    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (!target) {
            return embedService.error(interaction, 'User not found in this server.');
        }

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot kick yourself.');
        }

        if (target.user.bot) {
            return embedService.error(interaction, 'You cannot kick a bot.');
        }

        if (!target.kickable) {
            return embedService.error(interaction, 'I cannot kick this user. They may have a higher role than mine.');
        }

        await interaction.deferReply({ flags: 64 });

        const { infraction } = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'kick',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
        });

        await target.kick(reason);

        return embedService.modActionSuccess(interaction, {
            action: 'kick',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: interaction.guild.id,
            reason,
        });
    }
}