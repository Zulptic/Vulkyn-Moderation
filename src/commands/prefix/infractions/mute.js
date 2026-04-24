import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
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
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'mute <targetID> [duration] <Reason>', client);
        }

        const config = await getGuildConfig(message.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            return embedService.error(message, 'Server Mute role is not configured. Please re-invite the bot or set it up in the web panel.');
        }

        const muteRole = message.guild.roles.cache.get(muteRoleId);
        if (!muteRole) {
            return embedService.error(message, 'Server Mute role was deleted. Please re-invite the bot or set it up in the web panel.');
        }

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (target.user.bot) {
            return embedService.error(message, 'You cannot mute a bot.');
        }

        if (target.id === message.author.id) {
            return embedService.error(message, 'You cannot mute yourself.');
        }

        if (target.roles.cache.has(muteRoleId)) {
            return embedService.error(message, 'This user is already muted.');
        }

        let reasonArgs = args.slice(1);
        let duration = null;

        // Check for optional duration
        if (reasonArgs[0] && DURATION_REGEX.test(reasonArgs[0])) {
            duration = parseDuration(reasonArgs[0]);
            reasonArgs = reasonArgs.slice(1);
        }

        const reason = reasonArgs.join(' ') || 'No reason provided';

        await target.roles.add(muteRole, reason);

        const { infraction } = await logModAction(client, {
            guildId: message.guild.id,
            action: 'mute',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
            duration,
        });

        const durationText = duration ? args[1] : 'Permanent';

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