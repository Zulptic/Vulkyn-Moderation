import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";
import { logModAction } from "../../../services/moderationService.js";

export default {
    name: 'unmute',
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'unmute <targetID> [reason]', client);
        }

        const config = await getGuildConfig(message.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            return embedService.error(message, 'Server Mute role is not configured.');
        }

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (!target.roles.cache.has(muteRoleId)) {
            return embedService.error(message, 'This user is not muted.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        const { rows } = await client.db.query(
            `SELECT id FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [message.guild.id, target.id]
        );
        const originalInfractionId = rows[0]?.id;

        await target.roles.remove(muteRoleId, reason);

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true`,
            [message.guild.id, target.id]
        );

        await logModAction(client, {
            guildId: message.guild.id,
            action: 'unmute',
            moderatorId: message.author.id,
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