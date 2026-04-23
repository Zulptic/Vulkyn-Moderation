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
 * Build a Components V2 container.
 *
 * Options:
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

/*
 * Send a response to an interaction or message.
 */
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

/*
 * Send to a specific channel.
 */
async function sendToChannel(channel, type, options = {}) {
    const container = build(type, options);

    return channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

export const embedService = {
    success: (target, options = {}) => send(target, 'success', options),
    error: (target, options = {}) => send(target, 'error', { ephemeral: true, ...options }),
    warn: (target, options = {}) => send(target, 'warn', options),
    info: (target, options = {}) => send(target, 'info', options),
    neutral: (target, options = {}) => send(target, 'neutral', options),
    send: (target, type, options = {}) => send(target, type, options),
    toChannel: (channel, type, options = {}) => sendToChannel(channel, type, options),
    build,
    COLORS,
};