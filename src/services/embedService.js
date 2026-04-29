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
    error: '<:error_1:1496696665799917719><:error_2:1496696689032036483><:error_3:1496696754450464920>',
    success: '<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524>',
    warning: '<:warning_1:1496696965071900784><:warning_2:1496696992686936075><:warning_3:1496697019178418376>',
    usage: '<:command_1:1497044370254200902><:command_2:1497044410683359312><:command_3:1497044450185056456>',
    info: '<:information_1:1498073621652963441><:information_2:1498073635980578897><:information_3:1498073645430603806>',
    loading: '<a:loading:1498963770175783032>'
};

function formatUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;

    return [
        d && `${d}d`,
        h && `${h}h`,
        m && `${m}m`,
        `${sec}s`,
    ].filter(Boolean).join(' ');
}

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

    if (description) {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(description)
        );
    }

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

    if (image) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder({ media: { url: image } })
            )
        );
    }

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
            new TextDisplayBuilder().setContent(`${EMOJI.error} **|** ${reason}`)
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
            new TextDisplayBuilder().setContent(`${EMOJI.success} **|** ${reason}`)
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
            new TextDisplayBuilder().setContent(`${EMOJI.warning} **|** ${reason}`)
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
            new TextDisplayBuilder().setContent(`${EMOJI.usage} **|** ${prefix}${usage}`)
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
        `${EMOJI.info} **|** @${user.username}'s avatar\n`,
        `**Avatar:** [PNG](${avatarUrl}) | [WEBP](${avatarWebp})`,
    ];

    if (decorationUrl) {
        lines.push(`**Decoration:** [PNG](${decorationUrl})`);
    }

    if (!decorationUrl) {
        lines.push(`**Decoration:** ${EMOJI.no}`);
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
                `${EMOJI.info} **|** @${user.username}'s banner\n**Banner:** [PNG](${bannerUrl}) | [WEBP](${bannerWebp})`
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
    const created = `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`;
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

async function sendPing(target, client) {
    const ws = Math.round(client.ws.ping);
    const uptime = formatUptime(client.uptime);

    const lines = [
        `${EMOJI.info} **|** Bot Statistics\n`,
        `**Latency:** \`${ws}ms\``,
        `**Uptime:** \`${uptime}\``,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(lines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(client.user.displayAvatarURL({ extension: 'png', size: 512 }))
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `[Bot Status Page](https://discord.com)          •          [Support Server](https://discord.com)`
            )
        )

    return sendStandardized(target, container, false);
}

async function sendBotInfo(target, client) {
    const guildCount = client.guilds.cache.size;
    const memberCount = client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0);
    const shard = target.guild?.shardId ?? 0;
    const totalShards = client.shard?.count ?? 1;


    const footer = `Shard ${shard}/${totalShards}   •   Guilds: ${guildCount.toLocaleString()}   •   Members: ${memberCount.toLocaleString()}`;

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `<:Vulkyn_dev:1498445655176253491> **|** Team Members\n**@zulptic** | Lead Operations & Developer\n**@sog8** | Website Developer`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `[Website](https://discord.com) • [Dashboard](https://discord.com) • [Support Server](https://discord.com)`
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            td => td.setContent(`${footer}`)
        );

    return sendStandardized(target, container, false);
}

async function sendEmojiInfo(target, emoji) {
    let name, source, imageUrl, id;
    let animated = null;

    if (emoji.unicode) {
        name = emoji.name;
        source = 'Default (Unicode)';
        imageUrl = emoji.url;
        id = emoji.codepoints;
    } else if (emoji.external) {
        name = emoji.name;
        animated = emoji.animated;
        source = 'External Server';
        imageUrl = emoji.url;
        id = emoji.id;
    } else {
        name = emoji.name;
        animated = emoji.animated;
        source = emoji.guild?.name ?? 'Unknown';
        imageUrl = emoji.imageURL({
            extension: 'webp',
            size: 256,
            ...(emoji.animated && { animated: true })
        });
        id = emoji.id;
    }

    const headerLines = [
        `${EMOJI.info} **|** Emoji Information\n`,
        `**Name:** ${name}`,
    ];

    if (animated !== null) {
        headerLines.push(`**Animated:** ${animated ? EMOJI.yes : EMOJI.no}`);
    }

    headerLines.push(`**Source:** ${source}`);

    const footerLine = `ID: \`${id}\` • [Emoji Download](${imageUrl})`;

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(headerLines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(imageUrl)
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footerLine)
        );

    return sendStandardized(target, container, false);
}

async function sendStickerInfo(target, sticker) {
    const formatNames = { 1: 'PNG', 2: 'APNG', 3: 'Lottie', 4: 'GIF' };
    const formatName = formatNames[sticker.format] ?? 'Unknown';
    const isLottie = sticker.format === 3;
    const imageUrl = isLottie
        ? 'https://cdn.discordapp.com/embed/avatars/0.png'
        : sticker.url;

    const headerLines = [
        `${EMOJI.info} **|** Sticker Information\n`,
        `**Name:** ${sticker.name}`,
        `**Format:** ${formatName}`,
        `**Description:** ${sticker.description || 'N/A'}`,
    ];

    const downloadLabel = isLottie ? 'Lottie JSON' : 'Sticker Download';
    const footerLine = `ID: \`${sticker.id}\` • [${downloadLabel}](${sticker.url})`;

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(headerLines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(imageUrl)
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder({ media: { url: imageUrl } })
            )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footerLine)
        );

    return sendStandardized(target, container, false);
}

async function sendServerBannerInfo(target, guild) {
    const bannerUrl = guild.bannerURL({ extension: 'png', size: 1024 });
    const bannerWebp = guild.bannerURL({ extension: 'webp', size: 1024 });

    if (!bannerUrl) {
        return embedService.error(target, `${guild.name} does not have a banner.`);
    }

    const isAnimated = guild.banner?.startsWith('a_') ?? false;
    const links = [`[PNG](${bannerUrl})`, `[WEBP](${bannerWebp})`];

    if (isAnimated) {
        const bannerGif = guild.bannerURL({ extension: 'gif', size: 1024 });
        links.push(`[GIF](${bannerGif})`);
    }

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `${EMOJI.info} **|** ${guild.name}'s banner`,
                    `**Banner:** ${links.join(' | ')}`,
                    `**Animated:** ${isAnimated ? EMOJI.yes : EMOJI.no}`,
                ].join('\n')
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

async function sendServerIconInfo(target, guild) {
    const iconUrl = guild.iconURL({ extension: 'png', size: 1024 });
    const iconWebp = guild.iconURL({ extension: 'webp', size: 1024 });

    if (!iconUrl) {
        return embedService.error(target, `${guild.name} does not have an icon.`);
    }

    const isAnimated = guild.icon?.startsWith('a_') ?? false;
    const links = [`[PNG](${iconUrl})`, `[WEBP](${iconWebp})`];

    if (isAnimated) {
        const iconGif = guild.iconURL({ extension: 'gif', size: 1024 });
        links.push(`[GIF](${iconGif})`);
    }

    const lines = [
        `${EMOJI.info} **|** ${guild.name}'s icon\n`,
        `**Icon:** ${links.join(' | ')}`,
        `**Animated:** ${isAnimated ? EMOJI.yes : EMOJI.no}`,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(lines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(iconUrl)
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder({ media: { url: iconUrl } })
            )
        );

    return sendStandardized(target, container, false);
}

async function sendGuildInfo(target, guild) {
    await guild.fetch().catch(() => {});

    const owner = await guild.fetchOwner().catch(() => null);
    const created = `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`;
    const totalMembers = guild.memberCount;
    const botCount = guild.members.cache.filter(m => m.user.bot).size;
    const humanCount = totalMembers - botCount;
    const channels = guild.channels.cache;
    const textCount = channels.filter(c => c.type === 0).size;
    const voiceCount = channels.filter(c => c.type === 2).size;
    const categoryCount = channels.filter(c => c.type === 4).size;
    const totalChannels = channels.size;
    const totalEmojis = guild.emojis.cache.size;
    const animatedEmojis = guild.emojis.cache.filter(e => e.animated).size;
    const staticEmojis = totalEmojis - animatedEmojis;
    const roleCount = guild.roles.cache.size - 1;
    const stickerCount = guild.stickers.cache.size;
    const boostTier = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount ?? 0;
    const boosterCount = guild.members.cache.filter(m => m.premiumSince).size;

    const verificationLevels = {
        0: 'None',
        1: 'Low',
        2: 'Medium',
        3: 'High',
        4: 'Highest',
    };
    const verification = verificationLevels[guild.verificationLevel] ?? 'Unknown';

    const contentFilters = {
        0: 'Disabled',
        1: 'Members without roles',
        2: 'All members',
    };
    const contentFilter = contentFilters[guild.explicitContentFilter] ?? 'Unknown';

    const afkChannel = guild.afkChannel
        ? `<#${guild.afkChannel.id}> (${Math.floor(guild.afkTimeout / 60)} minute timeout)`
        : 'N/A';

    const systemChannel = guild.systemChannel
        ? `<#${guild.systemChannel.id}>`
        : 'N/A';

    const vanity = guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : null;

    const headerLines = [
        `${EMOJI.info} **|** ${guild.name}\n`,
        `Created: ${created}`,
        `Owner: ${owner ? `<@${owner.id}>` : 'Unknown'}`,
    ];

    const iconUrl = guild.iconURL({ extension: 'png', size: 256 })
        ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

    const statsLines = [
        `**Members:** ${totalMembers.toLocaleString()} (${humanCount.toLocaleString()} humans • ${botCount.toLocaleString()} bots)`,
        `**Channels:** ${totalChannels} (${textCount} text • ${voiceCount} voice • ${categoryCount} categories)`,
        `**Roles:** ${roleCount}`,
        `**Emojis:** ${totalEmojis} (${staticEmojis} static • ${animatedEmojis} animated)`,
        `**Stickers:** ${stickerCount}`,
    ];

    const boostLines = [
        `**Boost Tier:** Level ${boostTier}`,
        `**Boosts:** ${boostCount} (from ${boosterCount} boosters)`,
    ];

    const settingsLines = [
        `**Verification:** ${verification}`,
        `**Content Filter:** ${contentFilter}`,
        `**AFK Channel:** ${afkChannel}`,
        `**System Channel:** ${systemChannel}`,
    ];

    const footerParts = [`ID: \`${guild.id}\``];
    if (vanity) footerParts.push(`Vanity: ${vanity}`);
    const footerLine = `${footerParts.join(' • ')}`;

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(headerLines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(iconUrl)
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(statsLines.join('\n'))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(boostLines.join('\n'))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(settingsLines.join('\n'))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(footerLine)
        );

    return sendStandardized(target, container, false);
}

async function sendServerChannelInfo(target, guild) {
    const channels = guild.channels.cache;

    const counts = {
        category: channels.filter(c => c.type === 4).size,
        text: channels.filter(c => c.type === 0).size,
        voice: channels.filter(c => c.type === 2).size,
        stage: channels.filter(c => c.type === 13).size,
        announcement: channels.filter(c => c.type === 5).size,
        forum: channels.filter(c => c.type === 15).size,
        media: channels.filter(c => c.type === 16).size,
    };

    let activeThreadCount = 0;
    try {
        const fetched = await guild.channels.fetchActiveThreads();
        activeThreadCount = fetched.threads.size;
    } catch {
        // silently fallback to 0
    }

    const total = channels.size + activeThreadCount;

    const fmt = (n) => n > 0 ? `\`${n}\`` : EMOJI.no;

    const lines = [
        `${EMOJI.info} **|** ${guild.name}'s channel information\n`,
        `**Total:** ${fmt(total)}`,
        `**Category channels:** ${fmt(counts.category)}`,
        `**Text channels:** ${fmt(counts.text)}`,
        `**Voice channels:** ${fmt(counts.voice)}`,
        `**Stage channels:** ${fmt(counts.stage)}`,
        `**Announcement channels:** ${fmt(counts.announcement)}`,
        `**Forum channels:** ${fmt(counts.forum)}`,
        `**Media channels:** ${fmt(counts.media)}`,
        `**Active thread channels:** ${fmt(activeThreadCount)}`,
    ];

    const iconUrl = guild.iconURL({ extension: 'png', size: 256 })
        ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(lines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(iconUrl)
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`ID: \`${guild.id}\``)
        );

    return sendStandardized(target, container, false);
}

async function sendServerMemberCount(target, guild) {
    await guild.fetch().catch(() => {});
    await guild.members.fetch().catch(() => {});

    const total = guild.memberCount;
    const bots = guild.members.cache.filter(m => m.user.bot).size;
    const humans = total - bots;

    const fmt = (n) => n > 0 ? `\`${n.toLocaleString()}\`` : EMOJI.no;

    const lines = [
        `${EMOJI.info} **|** ${guild.name}'s member count\n`,
        `Total: ${fmt(total)}`,
        `Humans: ${fmt(humans)}`,
        `Bots: ${fmt(bots)}`,
    ];

    const iconUrl = guild.iconURL({ extension: 'png', size: 256 })
        ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = new ContainerBuilder()
        .setAccentColor(COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(lines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(iconUrl)
                )
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`ID: \`${guild.id}\``)
        );

    return sendStandardized(target, container, false);
}

async function sendRoleInfo(target, role) {
    const memberCount = role.members.size;
    const position = role.position;
    const colorHex = role.color === 0 ? 'Default' : `#${role.color.toString(16).padStart(6, '0').toUpperCase()}`;
    const created = `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`;

    const fmt = (n) => n > 0 ? `\`${n.toLocaleString()}\`` : EMOJI.no;
    const bool = (b) => b ? EMOJI.yes : EMOJI.no;

    const isBoosterRole = role.tags?.premiumSubscriberRole ?? false;

    const headerLines = [
        `${EMOJI.info} **|** ${role.name}'s information\n`,
        `**Members:** ${fmt(memberCount)}`,
        `**Position:** \`${position}\``,
        `**Color:** \`${colorHex}\``,
        `**Created:** ${created}`,
    ];

    const flagLines = [
        `**Hoisted:** ${bool(role.hoist)}`,
        `**Mentionable:** ${bool(role.mentionable)}`,
        `**Managed:** ${bool(role.managed)}`,
        `**Booster Role:** ${bool(isBoosterRole)}`,
    ];

    const keyPermissions = [
        ['Administrator', 'Administrator'],
        ['ManageGuild', 'Manage Server'],
        ['ManageRoles', 'Manage Roles'],
        ['ManageChannels', 'Manage Channels'],
        ['ManageMessages', 'Manage Messages'],
        ['KickMembers', 'Kick Members'],
        ['BanMembers', 'Ban Members'],
        ['MentionEveryone', 'Mention Everyone'],
    ];

    const heldPerms = keyPermissions
        .filter(([flag]) => role.permissions.has(flag))
        .map(([, label]) => `\`${label}\``);

    const permsLines = [];
    if (heldPerms.length === 0) {
        permsLines.push(`**Key Permissions:** ${EMOJI.no}`);
    } else {
        permsLines.push(`**Key Permissions:**`);
        for (let i = 0; i < heldPerms.length; i += 2) {
            const pair = heldPerms.slice(i, i + 2).join(', ');
            permsLines.push(pair);
        }
    }

    const accentColor = role.color === 0 ? null : role.color;

    const container = new ContainerBuilder();
    if (accentColor !== null) container.setAccentColor(accentColor);

    const roleIconUrl = role.iconURL({ extension: 'png', size: 256 });

    if (roleIconUrl) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    td => td.setContent(headerLines.join('\n'))
                )
                .setThumbnailAccessory(
                    thumb => thumb.setURL(roleIconUrl)
                )
        );
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(headerLines.join('\n'))
        );
    }

    container
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(flagLines.join('\n'))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(permsLines.join('\n'))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`ID: \`${role.id}\``)
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
    emojiInfo: (target, user) => sendEmojiInfo(target, user),
    botInfo: (target, client) => sendBotInfo(target, client),
    stickerInfo: (target, user) => sendStickerInfo(target, user),
    serverBannerInfo: (target, guild) => sendServerBannerInfo(target, guild),
    serverIconInfo: (target, guild) => sendServerIconInfo(target, guild),
    guildInfo: (target, guild) => sendGuildInfo(target, guild),
    serverChannelInfo: (target, guild) => sendServerChannelInfo(target, guild),
    serverMemberCount: (target, guild) => sendServerMemberCount(target, guild),
    roleInfo: (target, role) => sendRoleInfo(target, role),
    ping: (target, options = {}) => sendPing(target, options),
    send: (target, type, options = {}) => send(target, type, options),
    toChannel: (channel, type, options = {}) => sendToChannel(channel, type, options),
    build,
    COLORS,
    EMOJI,
};