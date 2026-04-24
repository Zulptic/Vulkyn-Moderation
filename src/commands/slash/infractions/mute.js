import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str.match(DURATION_REGEX);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    return num * multipliers[unit];
}

export default {
    name: 'mute',
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user (Server Mute role)')
        .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 5m, 1h, 7d) — permanent if not set'))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the mute')),
    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const config = await getGuildConfig(interaction.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            return embedService.error(interaction, 'Server Mute role is not configured. Please re-invite the bot or set it up in the web panel.');
        }

        const muteRole = interaction.guild.roles.cache.get(muteRoleId);
        if (!muteRole) {
            return embedService.error(interaction, 'Server Mute role was deleted. Please re-invite the bot or set it up in the web panel.');
        }

        if (!target) {
            return embedService.error(interaction, 'User not found in this server.');
        }

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot mute yourself.');
        }

        if (target.user.bot) {
            return embedService.error(interaction, 'You cannot mute a bot.');
        }

        if (target.roles.cache.has(muteRoleId)) {
            return embedService.error(interaction, 'This user is already muted.');
        }

        let duration = null;
        if (durationStr) {
            duration = parseDuration(durationStr);
            if (duration === null) {
                return embedService.error(interaction, 'Invalid duration (e.g. `5m`, `1h`, `7d`, `1w`).');
            }
        }

        await interaction.deferReply({ flags: 64 });

        await target.roles.add(muteRole, reason);

        const { infraction } = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'mute',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            duration,
        });

        const durationText = duration ? durationStr : 'Permanent';

        const container = new ContainerBuilder()
            .setAccentColor(0x47bc29)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524> **|** Muted **<@${target.id}>** **|** Case #${infraction.case_number} `)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Reason:** ${reason}\n**Duration:** ${durationText}\n**Date:** <t:${Math.floor(Date.now() / 1000)}:f>`)
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