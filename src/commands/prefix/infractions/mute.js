import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { createInfraction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d)$/;

function parseDuration(str) {
    if (str.toLowerCase() === 'perm') return null;
    const match = str.match(DURATION_REGEX);
    if (!match) return undefined;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * multipliers[unit];
}

export default {
    name: 'mute',
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'mute <targetID> <duration|perm> <Reason>', client);
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

        if (!args[1]) {
            return embedService.error(message, 'Please provide a duration (e.g. `5m`, `1h`, `7d`) or `perm`.');
        }

        const duration = parseDuration(args[1]);
        if (duration === undefined) {
            return embedService.error(message, 'Please provide a valid duration (e.g. `5m`, `1h`, `7d`) or `perm`.');
        }

        const isPerm = args[1].toLowerCase() === 'perm';
        const reason = args.slice(2).join(' ') || 'No reason provided';

        await target.roles.add(muteRole, reason);

        const infraction = await createInfraction(client, {
            guildId: message.guild.id,
            userId: target.id,
            moderatorId: message.author.id,
            type: 'mute',
            reason,
            duration: isPerm ? null : duration,
        });

        const durationText = isPerm ? 'Permanent' : args[1];

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