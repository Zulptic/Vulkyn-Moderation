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
    info: 0x0892ac,
    neutral: 0x888780,
    ban: 0xe24b4a,
    kick: 0xf09595,
    mute: 0xef9f27,
};

const EMOJI = {
    yes: '<:check:1498095724016042064>',
    no: '<:x_:1498093780014989474>',
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
                textDisplay => textDisplay.setContent(`**${title}**`)
            )
            .setThumbnailAccessory(
                thumb => thumb.setURL(thumbnail)
            );
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
    const prefixes = config?.commands?.prefixes || ['!'];
    const prefix = prefixes[0];

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

async function sendAvatarInfo(target, user) {
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 1024 });
    const avatarWebp = user.displayAvatarURL({ extension: 'webp', size: 1024 });
    const decorationUrl = user.avatarDecorationURL?.() ?? null;

    const lines = [
        `<:information_1:1498073621652963441><:information_2:1498073635980578897><:information_3:1498073645430603806> **|** @${user.username}'s avatar\n`,
        `Avatar: [PNG](${avatarUrl}) | [WEBP](${avatarWebp})`,
    ];

    if (decorationUrl) {
        lines.push(`Decoration: [PNG](${decorationUrl})`);
    }

    if (!decorationUrl) {
        lines.push(`Decoration: N/A`);
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(lines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(decorationUrl ?? avatarUrl)
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder({ media: { url: avatarUrl } })
            )
        );

    return sendStandardized(target, container, false);
}

async function sendBannerInfo(target, user) {
    const bannerUrl = user.bannerURL({ extension: 'png', size: 1024 });
    const bannerWebp = user.bannerURL({ extension: 'webp', size: 1024 });

    if (!bannerUrl) {
        return embedService.error(target, `${user.username} does not have a banner.`);
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `<:information_1:1498073621652963441><:information_2:1498073635980578897><:information_3:1498073645430603806> **|** @${user.username}'s banner\nBanner: [PNG](${bannerUrl}) | [WEBP](${bannerWebp})`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder({ media: { url: bannerUrl } })
            )
        );

    return sendStandardized(target, container, false);
}

async function sendChannelInfo(target, channel) {
    // No channel passed — list all channels in the guild
    if (!channel) {
        const guild = target.guild;
        const channels = guild.channels.cache
            .filter(c => c.type !== 4) // exclude categories
            .sort((a, b) => a.position - b.position);

        const typeMap = {
            0: '💬',
            2: '🔊',
            5: '📢',
            13: '🎙️',
            15: '💬',
            16: '🎞️',
        };

        const lines = [`<:information_1:1498073621652963441><:information_2:1498073635980578897><:information_3:1498073645430603806> **|** ${guild.name}'s channels\n`];

        for (const [, c] of channels) {
            const icon = typeMap[c.type] ?? '📁';
            const category = c.parent ? `${c.parent.name} • ` : '';
            lines.push(`${icon} **${c.name}** — ${category}\`${c.id}\``);
        }

        const container = new ContainerBuilder()
            .setAccentColor(COLORS.info)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(lines.join('\n'))
            );

        return sendStandardized(target, container, false);
    }

// Single channel info
    const created = `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`;

    const typeMap = {
        0: 'Text',
        2: 'Voice',
        4: 'Category',
        5: 'Announcement',
        13: 'Stage',
        15: 'Forum',
        16: 'Media',
    };

    const permsSynced = channel.permissionsLocked ?? false;
    const synced = permsSynced ? EMOJI.yes : EMOJI.no;
    const nsfw = channel.nsfw ? EMOJI.yes : EMOJI.no;
    const slowmode = channel.rateLimitPerUser
        ? `${EMOJI.yes} ${channel.rateLimitPerUser}s`
        : EMOJI.no;

    const parent = channel.parent
        ? `\`${channel.parent.id}\` | ${channel.parent.name}`
        : 'N/A';

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `<:information_1:1498073621652963441><:information_2:1498073635980578897><:information_3:1498073645430603806> **|** https://discord.com/channels/${channel.guild.id}/${channel.id}`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Name:** ${channel.name}`,
                    `**ID:** \`${channel.id}\``,
                    `**Parent:** ${parent}`,
                    `**Position:** ${channel.position + 1}`,
                    `**Synced Permissions:** ${synced}`,
                    `**Created:** ${created}`,
                    `**[Channel URL](https://discord.com/channels/${channel.guild.id}/${channel.id})**`,
                ].join('\n')
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**NSFW:** ${nsfw}`,
                    `**Slowmode:** ${slowmode}`,
                ].join('\n')
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Topic:** ${channel.topic ?? 'N/A'}`
            )
        );

    return sendStandardized(target, container, false);
}

export const embedService = {
    success: (target, reason) => sendSuccess(target, reason),
    error: (target, reason) => sendError(target, reason),
    warn: (target, reason) => sendWarning(target, reason),
    usage: (target, usage, client) => sendUsage(target, usage, client),
    info: (target, options = {}) => send(target, 'info', options),
    neutral: (target, options = {}) => send(target, 'neutral', options),
    avatarInfo: (target, user) => sendAvatarInfo(target, user),
    bannerInfo: (target, user) => sendBannerInfo(target, user),
    channelInfo: (target, user) => sendChannelInfo(target, user),
    send: (target, type, options = {}) => send(target, type, options),
    toChannel: (channel, type, options = {}) => sendToChannel(channel, type, options),
    build,
    COLORS,
    EMOJI,
};