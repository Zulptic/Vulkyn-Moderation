import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

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
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the timeout')),
    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
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
        });

        const container = new ContainerBuilder()
            .setAccentColor(0x47bc29)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524> **|** Timed out **<@${target.id}>** **|** Case #${infraction.case_number} `)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Reason:** ${reason}\n**Duration:** ${durationStr}\n**Date:** <t:${Math.floor(Date.now() / 1000)}:f>`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Web Panel')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://vulkyn.xyz/${interaction.guild.id}/infractions`)
                )
            );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    }
}