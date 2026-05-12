import { SlashCommandBuilder } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

export default {
    name: 'warn',
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the warning'))
        .addStringOption(opt => opt.setName('proof').setDescription('Evidence for this action (link or text)')),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const proof = interaction.options.getString('proof') || null;

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot warn yourself.');
        }

        if (target.bot) {
            return embedService.error(interaction, 'You cannot warn a bot.');
        }

        await interaction.deferReply({ flags: 64 });

        const { infraction } = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'warn',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            proof,
        });

        return embedService.modActionSuccess(interaction, {
            action: 'warn',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: interaction.guild.id,
            reason,
            proof,
        });
    }
}