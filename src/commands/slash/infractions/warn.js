import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, ThumbnailBuilder, MessageFlags } from "discord.js";
import { createInfraction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";

export default {
    name: 'warn',
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the warning')),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, { description: 'Are you sure you provided the correct ID? You provided your own Discord ID!' });
        }

        if (target.bot) {
            return embedService.error(interaction, { description: 'You cannot warn a bot!' });
        }

        await interaction.deferReply({ flags: 64 });

        const infraction = await createInfraction(client, {
            guildId: interaction.guild.id,
            userId: target.id,
            moderatorId: interaction.user.id,
            type: 'warn',
            reason,
        });

        const container = new ContainerBuilder()
            .setAccentColor(0xfac775)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`## ⚠️ Warning Issued`),
                        new TextDisplayBuilder().setContent(`<@${target.id}> has been warned.`)
                    )
                    .setThumbnail(new ThumbnailBuilder({ media: { url: target.displayAvatarURL() } }))
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Reason:** ${reason}`),
                new TextDisplayBuilder().setContent(`**Moderator:** <@${interaction.user.id}>`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Case #${infraction.case_number} • <t:${Math.floor(Date.now() / 1000)}:R>`)
            );

        await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    }
}