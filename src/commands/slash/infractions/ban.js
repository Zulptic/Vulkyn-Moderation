import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str.match(DURATION_REGEX);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    return num * multipliers[unit];
}

function parsePurgeDuration(str) {
    const parsed = parseDuration(str);
    if (parsed === null || parsed > 604800) return null;
    return parsed;
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
}

export default {
    name: 'ban',
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban'))
        .addStringOption(opt => opt.setName('duration').setDescription('Ban duration (e.g. 1h, 7d, 1w) — permanent if not set'))
        .addStringOption(opt => opt.setName('purge').setDescription('Delete message history (e.g. 30m, 6h, 3d, 1w)')),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const durationStr = interaction.options.getString('duration');
        const purgeStr = interaction.options.getString('purge');

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot ban yourself.');
        }

        if (target.bot) {
            return embedService.error(interaction, 'You cannot ban a bot.');
        }

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member && !member.bannable) {
            return embedService.error(interaction, 'I cannot ban this user. They may have a higher role than me.');
        }

        let duration = null;
        if (durationStr) {
            duration = parseDuration(durationStr);
            if (duration === null) {
                return embedService.error(interaction, 'Invalid duration (e.g. `1h`, `7d`, `1w`).');
            }
        }

        let deleteMessageSeconds = 0;
        if (purgeStr) {
            const parsed = parsePurgeDuration(purgeStr);
            if (parsed === null) {
                return embedService.error(interaction, 'Invalid purge duration. Max is 7 days (e.g. `30m`, `6h`, `3d`, `1w`).');
            }
            deleteMessageSeconds = parsed;
        }

        await interaction.deferReply({ flags: 64 });

        const { infraction } = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'ban',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            duration,
            metadata: {
                deleteMessageSeconds,
            },
        });

        await interaction.guild.members.ban(target.id, {
            reason,
            deleteMessageSeconds,
        });

        let detailsText = `**Reason:** ${reason}\n**Duration:** ${duration ? formatDuration(duration) : 'Permanent'}`;
        if (deleteMessageSeconds > 0) {
            detailsText += `\n**Purged:** ${formatDuration(deleteMessageSeconds)} of messages`;
        }
        detailsText += `\n**Date:** <t:${Math.floor(Date.now() / 1000)}:f>`;

        const container = new ContainerBuilder()
            .setAccentColor(0x47bc29)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524> **|** Banned **<@${target.id}>** **|** Case #${infraction.case_number} `)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(detailsText)
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