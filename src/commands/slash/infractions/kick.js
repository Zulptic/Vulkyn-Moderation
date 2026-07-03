import { SlashCommandBuilder } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { canPunishTarget } from "../../../services/permissionService.js";
import { errorService } from "../../../services/errorService.js";

export default {
    name: 'kick',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick'))
        .addStringOption(opt => opt.setName('proof').setDescription('Evidence for this action (link or text)')),

    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const proof = interaction.options.getString('proof') || null;

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

        const punishErr = canPunishTarget(interaction.member, target);
        if (punishErr) return embedService.error(interaction, punishErr);

        await interaction.deferReply({ flags: 64 });

        const kickError = await target.kick(reason).then(() => null).catch(err => err);
        if (kickError) {
            await errorService.commandError(client, kickError, interaction, 'kick', { targetId: target.id });
            return embedService.error(interaction, `Kick failed: ${kickError.message}`);
        }

        const logResult = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'kick',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            proof,
        });
        const infraction = logResult?.infraction;

        if (!infraction) {
            return embedService.error(interaction, 'Kick completed, but the infraction could not be recorded.');
        }

        return embedService.modActionSuccess(interaction, {
            action: 'kick',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: interaction.guild.id,
            reason,
            proof,
        });
    }
}
