import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } from "discord.js";

export default {
    name: 'testembed',
    data: new SlashCommandBuilder()
        .setName('testembed')
        .setDescription('Test all embed styles'),
    async execute(interaction, client) {
        await interaction.deferReply();

        // Simple text container
        const simple = new ContainerBuilder()
            .setAccentColor(0x97c459)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## ✅ Simple Container'),
                new TextDisplayBuilder().setContent('Just text with a green accent bar.')
            );

        // Container with fields and separators
        const withFields = new ContainerBuilder()
            .setAccentColor(0xbc2b2a)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('<:error_1:1496696665799917719><:error_2:1496696689032036483><:error_3:1496696754450464920> **|** You cannot warn yourself.')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('-# For support please join our Discord.')
            );

        // Container with thumbnail
        const section = new SectionBuilder()
            .addTextDisplayComponents(
                textDisplay => textDisplay.setContent('## ⚠️ Warning Issued'),
                textDisplay => textDisplay.setContent(`<@${interaction.user.id}> has been warned.`)
            )
            .setThumbnailAccessory(
                thumbnail => thumbnail.setURL(interaction.user.displayAvatarURL())
            );

        const withThumbnail = new ContainerBuilder()
            .setAccentColor(0xfac775)
            .addSectionComponents(section)
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**Reason:** Testing embeds'),
                new TextDisplayBuilder().setContent(`**Date:** <t:${Math.floor(Date.now() / 1000)}:F>`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Case #1 • <t:${Math.floor(Date.now() / 1000)}:R>`)
            );

        // Container with button
        const withButton = new ContainerBuilder()
            .setAccentColor(0x85b7eb)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## 🔗 Container with Button')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('Click the button below to visit the web panel.')
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Web Panel')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://vulkyn.xyz/${interaction.guild.id}/infractions`),
                    new ButtonBuilder()
                        .setLabel('Documentation')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://vulkyn.xyz/docs')
                )
            );

        // Container with image
        const withImage = new ContainerBuilder()
            .setAccentColor(0x888780)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## 🖼️ Container with Image')
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder({ media: { url: interaction.user.displayAvatarURL({ size: 256 }) } })
                )
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('-# Image gallery example')
            );

        // Container with all timestamps
        const timestamps = new ContainerBuilder()
            .setAccentColor(0xef9f27)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('## 🕐 Timestamp Formats'),
                new TextDisplayBuilder().setContent(`Short date/time: <t:${Math.floor(Date.now() / 1000)}:f>`),
                new TextDisplayBuilder().setContent(`Long date/time: <t:${Math.floor(Date.now() / 1000)}:F>`),
                new TextDisplayBuilder().setContent(`Short date: <t:${Math.floor(Date.now() / 1000)}:d>`),
                new TextDisplayBuilder().setContent(`Long date: <t:${Math.floor(Date.now() / 1000)}:D>`),
                new TextDisplayBuilder().setContent(`Short time: <t:${Math.floor(Date.now() / 1000)}:t>`),
                new TextDisplayBuilder().setContent(`Long time: <t:${Math.floor(Date.now() / 1000)}:T>`),
                new TextDisplayBuilder().setContent(`Relative: <t:${Math.floor(Date.now() / 1000)}:R>`)
            );

        await interaction.editReply({
            components: [simple],
            flags: MessageFlags.IsComponentsV2,
        });

        const containers = [withFields, withThumbnail, withButton, withImage, timestamps];
        for (const container of containers) {
            await interaction.channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    }
}