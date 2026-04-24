import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";
import { logModAction } from "../../../services/moderationService.js";

export default {
    name: 'unmute',
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the unmute')),
    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        const config = await getGuildConfig(interaction.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            return embedService.error(interaction, 'Server Mute role is not configured.');
        }

        if (!target) {
            return embedService.error(interaction, 'User not found in this server.');
        }

        if (!target.roles.cache.has(muteRoleId)) {
            return embedService.error(interaction, 'This user is not muted.');
        }

        const { rows } = await client.db.query(
            `SELECT id FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [interaction.guild.id, target.id]
        );
        const originalInfractionId = rows[0]?.id;

        await interaction.deferReply({ flags: 64 });

        await target.roles.remove(muteRoleId, reason);

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true`,
            [interaction.guild.id, target.id]
        );

        await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'unmute',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        const container = new ContainerBuilder()
            .setAccentColor(0x47bc29)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524> **|** Unmuted **<@${target.id}>** **|** Case #${originalInfractionId}`)
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