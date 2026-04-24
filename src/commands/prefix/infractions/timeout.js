import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
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
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'timeout <targetID> <duration> <Reason>', client);
        }

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (target.user.bot) {
            return embedService.error(message, 'You cannot timeout a bot.');
        }

        if (target.id === message.author.id) {
            return embedService.error(message, 'You cannot timeout yourself.');
        }

        if (!target.moderatable) {
            return embedService.error(message, 'I cannot timeout this user. They may have a higher role than me.');
        }

        const duration = parseDuration(args[1] || '');
        if (!duration) {
            return embedService.error(message, 'Please provide a valid duration (e.g. `5m`, `1h`, `7d`).');
        }

        if (duration > 2419200) {
            return embedService.error(message, 'Timeout duration cannot exceed 28 days.');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';

        await target.timeout(duration * 1000, reason);

        const { infraction } = await logModAction(client, {
            guildId: message.guild.id,
            action: 'timeout',
            moderatorId: message.author.id,
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
                new TextDisplayBuilder().setContent(`**Reason:** ${reason}\n**Duration:** ${args[1]}\n**Date:** <t:${Math.floor(Date.now() / 1000)}:f>`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Web Panel')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://vulkyn.xyz/${message.guild.id}/infractions`)
                )
            );

        await message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { repliedUser: false },
        });
    }
}