import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    SlashCommandBuilder
} from "discord.js";
import { createInfraction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

export default {
    name: 'kick',
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the kick')),

    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

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

        await interaction.deferReply({ flags: 64 });

        const infraction = await createInfraction(client, {
            guildId: interaction.guild.id,
            userId: target.id,
            moderatorId: interaction.user.id,
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
                        .setURL(`https://vulkyn.xyz/${interaction.guild.id}/infractions`)
                )
            );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    }
}