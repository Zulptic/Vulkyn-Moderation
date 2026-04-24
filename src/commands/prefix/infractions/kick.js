import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { createInfraction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

export default {
    name: 'kick',
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'kick <targetID> <Reason>', client);
        }

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (target.user.bot) {
            return embedService.error(message, 'You cannot kick a bot.');
        }

        if (target.id === message.author.id) {
            return embedService.error(message, 'You cannot kick yourself.');
        }

        if (!target.kickable) {
            return embedService.error(message, 'I cannot kick this user. They may have a higher role than mine.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided.';

        const infraction = await createInfraction(client, {
            guildId: message.guild.id,
            userId: target.id,
            moderatorId: message.author.id,
            type: 'kick',
            reason,
        });

        await target.kick(reason);

        const container = new ContainerBuilder()
            .setAccentColor(0x47bc29)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524> **|** Kicked **<@${target.id}>** **|** Case #${infraction.case_number} `)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Reason:** ${reason}\n**Date:** <t:${Math.floor(Date.now() / 1000)}:f>`)
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