import { SlashCommandBuilder } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { canPunishTarget } from "../../../services/permissionService.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d)$/;

function parseDuration(str) {
    const match = str.match(DURATION_REGEX);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * multipliers[unit];
}

export default {
    name: 'timeout',
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to timeout').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 5m, 1h, 7d)').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the timeout'))
        .addStringOption(opt => opt.setName('proof').setDescription('Evidence for this action (link or text)')),
    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const proof = interaction.options.getString('proof') || null;
        const duration = parseDuration(durationStr);

        if (!target) {
            return embedService.error(interaction, 'User not found in this server.');
        }

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot timeout yourself.');
        }

        if (target.user.bot) {
            return embedService.error(interaction, 'You cannot timeout a bot.');
        }

        if (!target.moderatable) {
            return embedService.error(interaction, 'I cannot timeout this user. They may have a higher role than me.');
        }

        const punishErr = canPunishTarget(interaction.member, target);
        if (punishErr) return embedService.error(interaction, punishErr);

        if (!duration) {
            return embedService.error(interaction, 'Please provide a valid duration (e.g. `5m`, `1h`, `7d`).');
        }

        if (duration > 2419200) {
            return embedService.error(interaction, 'Timeout duration cannot exceed 28 days.');
        }

        await interaction.deferReply({ flags: 64 });

        await target.timeout(duration * 1000, reason);

        const { infraction } = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'timeout',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            duration,
            proof,
        });

        return embedService.modActionSuccess(interaction, {
            action: 'timeout',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: interaction.guild.id,
            reason,
            duration: durationStr,
            proof,
        });
    }
}