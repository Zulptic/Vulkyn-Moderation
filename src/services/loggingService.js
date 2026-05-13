import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MessageFlags,
    AuditLogEvent,
    PermissionsBitField,
} from 'discord.js';
import { getGuildConfig } from './guildConfig.js';
import { logger } from '../utils/logger.js';

const EMOJI = {
    logging: '<:logging_1:1503523050266558464><:logging_2:1503523067106820117><:logging_3:1503523080851554414>',
    yes: '<:check:1498095724016042064>',
    no: '<:x_:1498093780014989474>',
};

const CHANNEL_TYPE_NAMES = {
    0: 'Text',
    2: 'Voice',
    4: 'Category',
    5: 'Announcement',
    13: 'Stage',
    15: 'Forum',
    16: 'Media',
};

function footer(executor = null) {
    const ts = `<t:${Math.floor(Date.now() / 1000)}:f>`;
    return executor ? `**@${executor.username}** | \`${executor.id}\` • ${ts}` : `${ts}`;
}

async function fetchAuditEntry(client, guildId, type) {
    try {
        await new Promise(r => setTimeout(r, 500));
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return null;
        const logs = await guild.fetchAuditLogs({ type, limit: 1 });
        return logs.entries.first() ?? null;
    } catch {
        return null;
    }
}

async function sendToLog(client, guildId, category, event, container) {
    try {
        const config = await getGuildConfig(guildId, client);
        if (!config?.logging?.enabled) return;

        const categoryConfig = config.logging[category];
        const channelId = categoryConfig?.[event] ?? categoryConfig?.categoryChannel;
        if (!channelId) return;

        const channel = client.channels.cache.get(channelId);
        if (!channel) return;

        await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        logger.error(`loggingService.sendToLog failed [${category}/${event}]:`, err);
    }
}

async function sendIntegrationCreate({ id, name, type, guildId, iconURL }, client) {
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.IntegrationCreate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287);

    if (iconURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(
                    [
                        `${EMOJI.logging} **|** Application Added`,
                        `**Name:** ${name}`,
                        `**Type:** ${type}`,
                        `**ID:** \`${id}\``,
                    ].join('\n')
                ))
                .setThumbnailAccessory(thumb => thumb.setURL(iconURL))
        );
    } else {
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `${EMOJI.logging} **|** Application Added`,
                    `**Name:** ${name}`,
                    `**Type:** ${type}`,
                    `**ID:** \`${id}\``,
                ].join('\n')
            )
        );
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'applications', 'integrationCreate', container);
}

async function sendIntegrationDelete({ id, guildId }, client) {
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.IntegrationDelete);
    const executor = entry?.executor ?? null;
    const changes = Object.fromEntries((entry?.changes ?? []).map(c => [c.key, c.old]));
    const name = changes.name ?? `\`${id}\``;
    const type = changes.type ?? 'Unknown';

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Application Removed`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Name:** ${name}`,
                    `**Type:** ${type}`,
                    `**ID:** \`${id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'applications', 'integrationDelete', container);
}

async function sendApplicationCommandPermissionsUpdate(data, client) {
    const entry = await fetchAuditEntry(client, data.guildId, AuditLogEvent.ApplicationCommandPermissionUpdate);
    const executor = entry?.executor ?? null;

    const guild = client.guilds.cache.get(data.guildId);
    const command = await guild?.commands.fetch(data.id).catch(() => null) ?? null;
    const commandName = command?.name ?? null;

    const appUser = await client.users.fetch(data.applicationId).catch(() => null);
    const iconURL = appUser?.displayAvatarURL({ extension: 'png', size: 256 }) ?? null;
    const appName = appUser?.username ?? null;

    const headerLines = [
        `${EMOJI.logging} **|** App Permissions Updated`,
        `**Name:** ${appName ? `${appName} — ` : ''}<@${data.applicationId}>`,
        `**ID:** \`${data.applicationId}\``,
        commandName
            ? `**Command:** ${commandName}`
            : `**Command:** \`${data.id}\``,
    ];

    const changedPerms = entry?.changes?.length
        ? entry.changes.map(c => c.new ?? c.old).filter(p => p && typeof p === 'object' && 'type' in p)
        : data.permissions;

    const roles = changedPerms.filter(p => p.type === 1);
    const users = changedPerms.filter(p => p.type === 2);
    const channels = changedPerms.filter(p => p.type === 3);

    const changeLines = [];
    if (roles.length) {
        changeLines.push(`**Role Changes:**`);
        for (const p of roles) changeLines.push(`> <@&${p.id}> — ${p.permission ? EMOJI.yes : EMOJI.no}`);
    }
    if (users.length) {
        changeLines.push(`**User Changes:**`);
        for (const p of users) changeLines.push(`> <@${p.id}> — ${p.permission ? EMOJI.yes : EMOJI.no}`);
    }
    if (channels.length) {
        changeLines.push(`**Channel Changes:**`);
        for (const p of channels) changeLines.push(`> <#${p.id}> — ${p.permission ? EMOJI.yes : EMOJI.no}`);
    }
    if (!changeLines.length) return;

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775);

    if (iconURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(headerLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(iconURL))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join('\n')));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(changeLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, data.guildId, 'applications', 'applicationCommandPermissionsUpdate', container);
}

async function sendCategoryCreate(channel, client) {
    const entry = await fetchAuditEntry(client, channel.guild.id, AuditLogEvent.ChannelCreate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Category Created`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Name:** ${channel.name}`,
                    `**Priority:** ${channel.position + 1}`,
                    `**Category ID:** \`${channel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, channel.guild.id, 'channels', 'categoryCreate', container);
}

async function sendCategoryDelete(channel, client) {
    const entry = await fetchAuditEntry(client, channel.guild.id, AuditLogEvent.ChannelDelete);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Category Deleted`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Name:** ${channel.name}`,
                    `**Category ID:** \`${channel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, channel.guild.id, 'channels', 'categoryDelete', container);
}

async function sendChannelCreate(channel, client) {
    const entry = await fetchAuditEntry(client, channel.guild.id, AuditLogEvent.ChannelCreate);
    const executor = entry?.executor ?? null;

    const typeName = CHANNEL_TYPE_NAMES[channel.type] ?? 'Unknown';
    const parent = channel.parent?.name ?? 'N/A';

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Created`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Name:** ${channel.name} — <#${channel.id}>`,
                    `**Type:** ${typeName}`,
                    `**Category:** ${parent}`,
                    `**Priority:** ${channel.position + 1}`,
                    `**Channel ID:** \`${channel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, channel.guild.id, 'channels', 'channelCreate', container);
}

async function sendChannelNameUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;

    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Name Updated`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Name:** ${oldChannel.name} → ${newChannel.name}`,
                    `**Channel:** <#${newChannel.id}>`,
                    `**ID:** \`${newChannel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newChannel.guild.id, 'channels', 'channelNameUpdate', container);
}

async function sendChannelParentUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;

    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;

    const oldParent = oldChannel.parent?.name ?? 'None';
    const newParent = newChannel.parent?.name ?? 'None';

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Category Updated`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Category:** ${oldParent} → ${newParent}`,
                    `**Channel:** <#${newChannel.id}>`,
                    `**ID:** \`${newChannel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newChannel.guild.id, 'channels', 'channelParentUpdate', container);
}

async function sendChannelNSFWUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;

    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(newChannel.nsfw ? 0x57f287 : 0xe24b4a)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel NSFW Updated`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**NSFW:** ${oldChannel.nsfw ? 'Enabled' : 'Disabled'} → ${newChannel.nsfw ? 'Enabled' : 'Disabled'}`,
                    `**Channel:** <#${newChannel.id}>`,
                    `**ID:** \`${newChannel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newChannel.guild.id, 'channels', 'channelNSFWUpdate', container);
}

async function sendChannelTopicUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;

    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;

    const oldTopic = oldChannel.topic || 'None';
    const newTopic = newChannel.topic || 'None';

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Topic Updated`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Topic:** ${oldTopic} → ${newTopic}`,
                    `**Channel:** <#${newChannel.id}>`,
                    `**ID:** \`${newChannel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newChannel.guild.id, 'channels', 'channelTopicUpdate', container);
}

async function sendChannelTypeUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const oldType = CHANNEL_TYPE_NAMES[oldChannel.type] ?? 'Unknown';
    const newType = CHANNEL_TYPE_NAMES[newChannel.type] ?? 'Unknown';
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Type Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Type:** ${oldType} → ${newType}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelTypeUpdate', container);
}

async function sendChannelBitrateUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Bitrate Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Bitrate:** ${oldChannel.bitrate / 1000}kbps → ${newChannel.bitrate / 1000}kbps`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelBitrateUpdate', container);
}

async function sendChannelUserLimitUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => v === 0 ? 'Unlimited' : `${v}`;
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel User Limit Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**User Limit:** ${fmt(oldChannel.userLimit)} → ${fmt(newChannel.userLimit)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelUserLimitUpdate', container);
}

async function sendChannelSlowModeUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => v === 0 ? 'Off' : `${v}s`;
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Slow Mode Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Slow Mode:** ${fmt(oldChannel.rateLimitPerUser)} → ${fmt(newChannel.rateLimitPerUser)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelSlowModeUpdate', container);
}

async function sendChannelRTCRegionUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => v ?? 'Automatic';
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Region Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Region:** ${fmt(oldChannel.rtcRegion)} → ${fmt(newChannel.rtcRegion)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelRTCRegionUpdate', container);
}

async function sendChannelVideoQualityUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => v === 2 ? 'Full (720p)' : 'Auto';
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Video Quality Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Video Quality:** ${fmt(oldChannel.videoQualityMode)} → ${fmt(newChannel.videoQualityMode)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelVideoQualityUpdate', container);
}

const ARCHIVE_DURATION_NAMES = { 60: '1 Hour', 1440: '1 Day', 4320: '3 Days', 10080: '1 Week' };
const SORT_ORDER_NAMES = { 0: 'Latest Activity', 1: 'Creation Date' };
const FORUM_LAYOUT_NAMES = { 0: 'Not Set', 1: 'List View', 2: 'Gallery View' };

async function sendChannelDefaultArchiveDurationUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => ARCHIVE_DURATION_NAMES[v] ?? 'None';
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Default Archive Duration Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Archive Duration:** ${fmt(oldChannel.defaultAutoArchiveDuration)} → ${fmt(newChannel.defaultAutoArchiveDuration)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelDefaultArchiveDurationUpdate', container);
}

async function sendChannelDefaultThreadSlowModeUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => v === 0 ? 'Off' : `${v}s`;
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Default Thread Slow Mode Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Thread Slow Mode:** ${fmt(oldChannel.defaultThreadRateLimitPerUser ?? 0)} → ${fmt(newChannel.defaultThreadRateLimitPerUser ?? 0)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelDefaultThreadSlowModeUpdate', container);
}

async function sendChannelDefaultReactionEmojiUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = e => e ? (e.name ?? `\`${e.id}\``) : 'None';
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Default Reaction Emoji Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Reaction Emoji:** ${fmt(oldChannel.defaultReactionEmoji)} → ${fmt(newChannel.defaultReactionEmoji)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelDefaultReactionEmojiUpdate', container);
}

async function sendChannelDefaultSortOrderUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => SORT_ORDER_NAMES[v] ?? 'None';
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Default Sort Order Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Sort Order:** ${fmt(oldChannel.defaultSortOrder)} → ${fmt(newChannel.defaultSortOrder)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelDefaultSortOrderUpdate', container);
}

async function sendChannelForumTagsUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;

    const oldTags = new Map((oldChannel.availableTags ?? []).map(t => [t.id, t]));
    const newTags = new Map((newChannel.availableTags ?? []).map(t => [t.id, t]));
    const added = [...newTags.values()].filter(t => !oldTags.has(t.id));
    const removed = [...oldTags.values()].filter(t => !newTags.has(t.id));

    const fmtTag = t => t.emoji?.name ? `${t.emoji.name} ${t.name}` : t.name;

    const detailLines = [];
    if (added.length) detailLines.push(`**Added:** ${added.map(fmtTag).join(', ')}`);
    if (removed.length) detailLines.push(`**Removed:** ${removed.map(fmtTag).join(', ')}`);
    if (!detailLines.length) return;
    detailLines.push(`**Channel:** <#${newChannel.id}>`);
    detailLines.push(`**ID:** \`${newChannel.id}\``);

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Forum Tags Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelForumTagsUpdate', container);
}

async function sendChannelForumLayoutUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const entry = await fetchAuditEntry(client, newChannel.guild.id, AuditLogEvent.ChannelUpdate);
    const executor = entry?.executor ?? null;
    const fmt = v => FORUM_LAYOUT_NAMES[v] ?? 'Unknown';
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Forum Layout Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Layout:** ${fmt(oldChannel.defaultForumLayout)} → ${fmt(newChannel.defaultForumLayout)}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelForumLayoutUpdate', container);
}

async function sendChannelVoiceStatusUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Voice Channel Status Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Status:** ${oldChannel.status || 'None'} → ${newChannel.status || 'None'}`,
            `**Channel:** <#${newChannel.id}>`,
            `**ID:** \`${newChannel.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(null)));
    await sendToLog(client, newChannel.guild.id, 'channels', 'channelVoiceStatusUpdate', container);
}

async function sendChannelPinsUpdate(channel, time, client) {
    if (!channel.guild) return;

    const now = Date.now();
    const threshold = 10000;

    const [pinEntry, unpinEntry] = await Promise.all([
        fetchAuditEntry(client, channel.guild.id, AuditLogEvent.MessagePin),
        fetchAuditEntry(client, channel.guild.id, AuditLogEvent.MessageUnpin),
    ]);

    const pinAge = pinEntry ? now - pinEntry.createdTimestamp : Infinity;
    const unpinAge = unpinEntry ? now - unpinEntry.createdTimestamp : Infinity;

    let entry = null;
    let action = 'Pins Updated';
    let color = 0xfac775;

    if (pinAge < threshold && pinAge <= unpinAge) {
        entry = pinEntry;
        action = 'Message Pinned';
        color = 0x57f287;
    } else if (unpinAge < threshold) {
        entry = unpinEntry;
        action = 'Message Unpinned';
        color = 0xe24b4a;
    }

    const executor = entry?.executor ?? null;
    const messageId = entry?.extra?.messageId ?? null;
    const messageLink = messageId
        ? `https://discord.com/channels/${channel.guild.id}/${channel.id}/${messageId}`
        : null;

    const authorId = entry?.targetId ?? null;
    const authorUser = authorId ? await client.users.fetch(authorId).catch(() => null) : null;
    const authorName = authorUser?.username ?? null;

    const detailLines = [
        `**Channel:** ${channel.name} — <#${channel.id}>`,
        messageLink ? `**Message:** [Jump to message](${messageLink})` : null,
        authorId ? `**Message Author:** ${authorName ? `${authorName} — ` : ''}<@${authorId}>` : null,
        `**Channel ID:** \`${channel.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder()
        .setAccentColor(color)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** ${action}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, channel.guild.id, 'channels', 'channelPinsUpdate', container);
}

const PERM_NAME_OVERRIDES = {
    SendTTSMessages: 'Send TTS Messages',
    UseVAD: 'Use VAD',
};

function formatPermName(name) {
    return PERM_NAME_OVERRIDES[name] ?? name.replace(/([A-Z])/g, ' $1').trim();
}


async function sendChannelPermissionsUpdate(oldChannel, newChannel, client) {
    if (!newChannel.guild) return;

    const oldOws = oldChannel.permissionOverwrites?.cache ?? new Map();
    const newOws = newChannel.permissionOverwrites?.cache ?? new Map();

    const changed = [];
    for (const [id, newOw] of newOws) {
        const oldOw = oldOws.get(id);
        if (!oldOw) {
            changed.push({ overwrite: newOw, action: 'Created', color: 0x57f287 });
        } else if (oldOw.allow.bitfield !== newOw.allow.bitfield || oldOw.deny.bitfield !== newOw.deny.bitfield) {
            changed.push({ overwrite: newOw, action: 'Updated', color: 0xfac775 });
        }
    }
    for (const [id, oldOw] of oldOws) {
        if (!newOws.has(id)) {
            changed.push({ overwrite: oldOw, action: 'Removed', color: 0xe24b4a });
        }
    }

    if (!changed.length) return;

    const auditTypeMap = {
        Created: AuditLogEvent.ChannelOverwriteCreate,
        Updated: AuditLogEvent.ChannelOverwriteUpdate,
        Removed: AuditLogEvent.ChannelOverwriteDelete,
    };

    const now = Date.now();
    const threshold = 10000;

    const getBitPerms = bits => {
        if (!bits || bits === 0n) return [];
        return Object.entries(PermissionsBitField.Flags)
            .filter(([, flag]) => (bits & BigInt(flag)) !== 0n)
            .map(([name]) => name);
    };

    for (const { overwrite, action, color } of changed) {
        const entry = await fetchAuditEntry(client, newChannel.guild.id, auditTypeMap[action]);
        const entryTargetId = entry?.extra?.id?.id ?? null;
        const executor = (entryTargetId === overwrite.id && entry && (now - entry.createdTimestamp) < threshold)
            ? (entry.executor ?? null)
            : null;

        const isRole = overwrite.type === 0 || overwrite.type === '0' || overwrite.type === 'role';

        let targetName = null;
        if (isRole) {
            const role = newChannel.guild.roles.cache.get(overwrite.id)
                ?? await newChannel.guild.roles.fetch(overwrite.id).catch(() => null);
            targetName = role?.name ?? entry?.extra?.roleName ?? '@deleted-role';
        } else {
            const member = newChannel.guild.members.cache.get(overwrite.id)
                ?? await newChannel.guild.members.fetch(overwrite.id).catch(() => null);
            targetName = member?.user?.username ?? member?.displayName ?? 'Unknown User';
        }

        const allowBits = BigInt(overwrite.allow.bitfield);
        const denyBits = BigInt(overwrite.deny.bitfield);
        const allowedPerms = getBitPerms(allowBits);
        const deniedPerms = getBitPerms(denyBits);
        if (!allowedPerms.length && !deniedPerms.length) continue;

        const bodyLines = [`**${targetName}**`];
        if (allowedPerms.length) bodyLines.push(`> ${EMOJI.yes} ${allowedPerms.map(p => `\`${formatPermName(p)}\``).join(', ')}`);
        if (deniedPerms.length) bodyLines.push(`> ${EMOJI.no} ${deniedPerms.map(p => `\`${formatPermName(p)}\``).join(', ')}`);

        const container = new ContainerBuilder()
            .setAccentColor(color)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Permissions ${action}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent([
                `**Channel:** ${newChannel.name} — <#${newChannel.id}>`,
                `**Channel ID:** \`${newChannel.id}\``,
            ].join('\n')))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join('\n')))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

        await sendToLog(client, newChannel.guild.id, 'channels', 'channelPermissionsUpdate', container);
    }
}

async function sendChannelDelete(channel, client) {
    const entry = await fetchAuditEntry(client, channel.guild.id, AuditLogEvent.ChannelDelete);
    const executor = entry?.executor ?? null;

    const parent = channel.parent?.name ?? 'N/A';

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Channel Deleted`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `**Name:** ${channel.name}`,
                    `**Category:** ${parent}`,
                    `**Channel ID:** \`${channel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, channel.guild.id, 'channels', 'channelDelete', container);
}

export const loggingService = {
    integrationCreate: (integration, client) => sendIntegrationCreate(integration, client),
    integrationDelete: (integration, client) => sendIntegrationDelete(integration, client),
    applicationCommandPermissionsUpdate: (data, client) => sendApplicationCommandPermissionsUpdate(data, client),
    categoryCreate: (channel, client) => sendCategoryCreate(channel, client),
    categoryDelete: (channel, client) => sendCategoryDelete(channel, client),
    channelCreate: (channel, client) => sendChannelCreate(channel, client),
    channelDelete: (channel, client) => sendChannelDelete(channel, client),
    channelNameUpdate: (oldChannel, newChannel, client) => sendChannelNameUpdate(oldChannel, newChannel, client),
    channelTopicUpdate: (oldChannel, newChannel, client) => sendChannelTopicUpdate(oldChannel, newChannel, client),
    channelParentUpdate: (oldChannel, newChannel, client) => sendChannelParentUpdate(oldChannel, newChannel, client),
    channelTypeUpdate: (oldChannel, newChannel, client) => sendChannelTypeUpdate(oldChannel, newChannel, client),
    channelBitrateUpdate: (oldChannel, newChannel, client) => sendChannelBitrateUpdate(oldChannel, newChannel, client),
    channelUserLimitUpdate: (oldChannel, newChannel, client) => sendChannelUserLimitUpdate(oldChannel, newChannel, client),
    channelSlowModeUpdate: (oldChannel, newChannel, client) => sendChannelSlowModeUpdate(oldChannel, newChannel, client),
    channelRTCRegionUpdate: (oldChannel, newChannel, client) => sendChannelRTCRegionUpdate(oldChannel, newChannel, client),
    channelVideoQualityUpdate: (oldChannel, newChannel, client) => sendChannelVideoQualityUpdate(oldChannel, newChannel, client),
    channelDefaultArchiveDurationUpdate: (oldChannel, newChannel, client) => sendChannelDefaultArchiveDurationUpdate(oldChannel, newChannel, client),
    channelDefaultThreadSlowModeUpdate: (oldChannel, newChannel, client) => sendChannelDefaultThreadSlowModeUpdate(oldChannel, newChannel, client),
    channelDefaultReactionEmojiUpdate: (oldChannel, newChannel, client) => sendChannelDefaultReactionEmojiUpdate(oldChannel, newChannel, client),
    channelDefaultSortOrderUpdate: (oldChannel, newChannel, client) => sendChannelDefaultSortOrderUpdate(oldChannel, newChannel, client),
    channelForumTagsUpdate: (oldChannel, newChannel, client) => sendChannelForumTagsUpdate(oldChannel, newChannel, client),
    channelForumLayoutUpdate: (oldChannel, newChannel, client) => sendChannelForumLayoutUpdate(oldChannel, newChannel, client),
    channelVoiceStatusUpdate: (oldChannel, newChannel, client) => sendChannelVoiceStatusUpdate(oldChannel, newChannel, client),
    channelNSFWUpdate: (oldChannel, newChannel, client) => sendChannelNSFWUpdate(oldChannel, newChannel, client),
    channelPinsUpdate: (channel, time, client) => sendChannelPinsUpdate(channel, time, client),
    channelPermissionsUpdate: (oldChannel, newChannel, client) => sendChannelPermissionsUpdate(oldChannel, newChannel, client),
};
