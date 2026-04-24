import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags,
} from 'discord.js';

const COLORS = {
    success: 0x97c459,
    error: 0xe24b4a,
    warn: 0xfac775,
    info: 0x85b7eb,
    neutral: 0x888780,
    ban: 0xe24b4a,
    kick: 0xf09595,
    mute: 0xef9f27,
};

/*
 *   color       - Override color with a hex value
 *   title       - Bold heading text
 *   description - Body text (supports markdown)
 *   fields      - Array of { name, value } objects
 *   footer      - Small muted text at the bottom
 *   image       - URL for a large image
 *   thumbnail   - URL for a small thumbnail
 *   timestamp   - true for current time, or a Date object
 */
function build(type, options = {}) {
    const {
        color,
        title,
        description,
        fields,
        footer,
        image,
        thumbnail,
        timestamp,
    } = options;

    const accentColor = color ?? COLORS[type] ?? COLORS.neutral;
    const container = new ContainerBuilder().setAccentColor(accentColor);

    // Title with thumbnail
    if (title && thumbnail) {
        const section = new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${title}**`)
            )
            .setThumbnail(new ThumbnailBuilder({ media: { url: thumbnail } }));
        container.addSectionComponents(section);
    } else if (title) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${title}**`)
        );
    }

    // Description
    if (description) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(description)
        );
    }

    // Fields
    if (fields && fields.length > 0) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        for (const field of fields) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${field.name}:** ${field.value}`)
            );
        }
    }

    // Image
    if (image) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder({ media: { url: image } })
            )
        );
    }

    // Footer and/or timestamp
    if (footer || timestamp) {
        container.addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );

        let footerText = '';
        if (footer) footerText += footer;
        if (footer && timestamp) footerText += ' • ';
        if (timestamp) {
            const date = timestamp === true ? new Date() : timestamp;
            footerText += `<t:${Math.floor(date.getTime() / 1000)}:R>`;
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`-# ${footerText}`)
        );
    }

    return container;
}

async function send(target, type, options = {}) {
    const container = build(type, options);
    const flags = options.ephemeral
        ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        : MessageFlags.IsComponentsV2;

    const payload = {
        components: [container],
        flags,
        allowedMentions: { repliedUser: false },
    };

    if (target.isChatInputCommand?.()) {
        if (target.replied || target.deferred) {
            return target.editReply(payload);
        }
        return target.reply(payload);
    }

    return target.reply(payload);
}

async function sendToChannel(channel, type, options = {}) {
    const container = build(type, options);

    return channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}



async function sendError(target, reason) {
    const container = new ContainerBuilder()
        .setAccentColor(0xbc2b2a)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:error_1:1496696665799917719><:error_2:1496696689032036483><:error_3:1496696754450464920> **|** ${reason}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# For support please join our Discord.')
        );

    return sendStandardized(target, container, true);
}

async function sendSuccess(target, reason) {
    const container = new ContainerBuilder()
        .setAccentColor(0x97c459)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524> **|** ${reason}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# For support please join our Discord.')
        );

    return sendStandardized(target, container, false);
}

async function sendWarning(target, reason) {
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:warning_1:1496696965071900784><:warning_2:1496696992686936075><:warning_3:1496697019178418376> **|** ${reason}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# For support please join our Discord.')
        );

    return sendStandardized(target, container, false);
}

async function sendUsage(target, usage, client) {
    const guildId = target.guild?.id || target.guildId;
    const { getGuildConfig } = await import('./guildConfig.js');
    const config = await getGuildConfig(guildId, client);
    const prefix = config?.prefix || '!';

    const container = new ContainerBuilder()
        .setAccentColor(0x143bf4)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<:command_1:1497044370254200902><:command_2:1497044410683359312><:command_3:1497044450185056456> **|** ${prefix}${usage}`)
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('-# For support please join our Discord.')
        );

    return sendStandardized(target, container, true);
}

async function sendStandardized(target, container, ephemeral) {
    const flags = ephemeral
        ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        : MessageFlags.IsComponentsV2;

    const payload = {
        components: [container],
        flags,
        allowedMentions: { repliedUser: false },
    };

    if (target.isChatInputCommand?.()) {
        if (target.replied || target.deferred) {
            return target.editReply(payload);
        }
        return target.reply(payload);
    }

    return target.reply(payload);
}

export const embedService = {
    success: (target, reason) => sendSuccess(target, reason),
    error: (target, reason) => sendError(target, reason),
    warn: (target, reason) => sendWarning(target, reason),
    usage: (target, usage, client) => sendUsage(target, usage, client),
    info: (target, options = {}) => send(target, 'info', options),
    neutral: (target, options = {}) => send(target, 'neutral', options),
    send: (target, type, options = {}) => send(target, type, options),
    toChannel: (channel, type, options = {}) => sendToChannel(channel, type, options),
    build,
    COLORS,
};