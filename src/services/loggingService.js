import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MessageFlags,
    AuditLogEvent,
    PermissionsBitField,
    ChannelType,
    GuildScheduledEventStatus,
    GuildScheduledEventEntityType,
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

const PERM_NAME_OVERRIDES = {
    SendTTSMessages: 'Send TTS Messages',
    UseVAD: 'Use VAD',
};

const ARCHIVE_DURATION_NAMES = { 60: '1 Hour', 1440: '1 Day', 4320: '3 Days', 10080: '1 Week' };
const AUTOMOD_TRIGGER_NAMES = { 1: 'Keyword', 2: 'Spam', 3: 'Keyword Preset', 4: 'Mention Spam', 5: 'Member Profile' };
const WEBHOOK_TYPE_NAMES = { 1: 'Incoming', 2: 'Channel Follower', 3: 'Application' };
const AUTOMOD_ACTION_NAMES = { 1: 'Block Message', 2: 'Send Alert Message', 3: 'Timeout' };
const AUTOMOD_PRESET_NAMES = { 1: 'Profanity', 2: 'Sexual Content', 3: 'Slurs' };
const SORT_ORDER_NAMES = { 0: 'Latest Activity', 1: 'Creation Date' };
const FORUM_LAYOUT_NAMES = { 0: 'Not Set', 1: 'List View', 2: 'Gallery View' };
const SCHEDULED_EVENT_STATUS_NAMES = { 1: 'Scheduled', 2: 'Active', 3: 'Completed', 4: 'Cancelled' };
const SCHEDULED_EVENT_ENTITY_TYPE_NAMES = { 1: 'Stage Instance', 2: 'Voice', 3: 'External' };

function formatPermName(name) {
    return PERM_NAME_OVERRIDES[name] ?? name.replace(/([A-Z])/g, ' $1').trim();
}

function footer(executor = null) {
    const ts = `<t:${Math.floor(Date.now() / 1000)}:f>`;
    return executor ? `**@${executor.username}** | \`${executor.id}\` • ${ts}` : `${ts}`;
}

function changeVal(changes, key, field) {
    return changes?.find(c => c.key === key)?.[field] ?? null;
}

function formatEventLocation(event) {
    if (event.channelId) return `<#${event.channelId}>`;
    if (event.entityMetadata?.location) return event.entityMetadata.location;
    return 'Unknown';
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

async function sendEmojiCreate(emoji, client) {
    const entry = await fetchAuditEntry(client, emoji.guild.id, AuditLogEvent.EmojiCreate);
    const executor = entry?.executor ?? null;

    const imageURL = emoji.imageURL({ extension: emoji.animated ? 'gif' : 'png', size: 128 });
    const restrictedRoles = emoji.roles.cache;
    const rolesLine = restrictedRoles.size
        ? `**Restricted To:** ${[...restrictedRoles.values()].map(r => `<@&${r.id}>`).join(', ')}`
        : null;

    const contentLines = [
        `${EMOJI.logging} **|** Emoji Created`,
        `**Name:** :${emoji.name}:`,
        `**Animated:** ${emoji.animated ? EMOJI.yes : EMOJI.no}`,
        rolesLine,
        `**ID:** \`${emoji.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder().setAccentColor(0x57f287);

    if (imageURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(contentLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(imageURL))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentLines.join('\n')));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, emoji.guild.id, 'emojis', 'emojiCreate', container);
}

async function sendEmojiDelete(emoji, client) {
    const entry = await fetchAuditEntry(client, emoji.guild.id, AuditLogEvent.EmojiDelete);
    const executor = entry?.executor ?? null;

    const imageURL = emoji.imageURL({ extension: emoji.animated ? 'gif' : 'png', size: 128 });

    const contentLines = [
        `${EMOJI.logging} **|** Emoji Deleted`,
        `**Name:** :${emoji.name}:`,
        `**Animated:** ${emoji.animated ? EMOJI.yes : EMOJI.no}`,
        `**ID:** \`${emoji.id}\``,
    ];

    const container = new ContainerBuilder().setAccentColor(0xe24b4a);

    if (imageURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(contentLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(imageURL))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentLines.join('\n')));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, emoji.guild.id, 'emojis', 'emojiDelete', container);
}

async function sendEmojiNameUpdate(oldEmoji, newEmoji, client) {
    const entry = await fetchAuditEntry(client, newEmoji.guild.id, AuditLogEvent.EmojiUpdate);
    const executor = entry?.executor ?? null;

    const imageURL = newEmoji.imageURL({ extension: newEmoji.animated ? 'gif' : 'png', size: 128 });

    const contentLines = [
        `${EMOJI.logging} **|** Emoji Name Updated`,
        `\n**Name:** :${oldEmoji.name}: → :${newEmoji.name}:`,
        `**ID:** \`${newEmoji.id}\``,
    ];

    const container = new ContainerBuilder().setAccentColor(0xfac775);

    if (imageURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(contentLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(imageURL))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentLines.join('\n')));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEmoji.guild.id, 'emojis', 'emojiNameUpdate', container);
}

async function sendEmojiRolesUpdate(oldEmoji, newEmoji, client) {
    const entry = await fetchAuditEntry(client, newEmoji.guild.id, AuditLogEvent.EmojiUpdate);
    const executor = entry?.executor ?? null;

    const oldRoles = oldEmoji.roles.cache;
    const newRoles = newEmoji.roles.cache;
    const added = [...newRoles.values()].filter(r => !oldRoles.has(r.id));
    const removed = [...oldRoles.values()].filter(r => !newRoles.has(r.id));
    if (!added.length && !removed.length) return;

    const imageURL = newEmoji.imageURL({ extension: newEmoji.animated ? 'gif' : 'png', size: 128 });

    const detailLines = [
        `${EMOJI.logging} **|** Emoji Roles Updated`,
        `**Emoji:** :${newEmoji.name}: \`${newEmoji.name}\``,
        added.length ? `**Added:** ${added.map(r => `<@&${r.id}>`).join(', ')}` : null,
        removed.length ? `**Removed:** ${removed.map(r => `<@&${r.id}>`).join(', ')}` : null,
        newRoles.size === 0 ? `**Restrictions:** None (unrestricted)` : null,
        `**ID:** \`${newEmoji.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder().setAccentColor(0xfac775);

    if (imageURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(detailLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(imageURL))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEmoji.guild.id, 'emojis', 'emojiRolesUpdate', container);
}

async function sendAutoModRuleCreate(rule, client) {
    const guildId = rule.guild?.id ?? rule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleCreate);
    const executor = entry?.executor ?? null;

    const triggerName = AUTOMOD_TRIGGER_NAMES[rule.triggerType] ?? 'Unknown';

    const actionLines = rule.actions.map(a => {
        const name = AUTOMOD_ACTION_NAMES[a.type] ?? 'Unknown';
        if (a.type === 2 && a.metadata?.channelId) return `> ${name} (<#${a.metadata.channelId}>)`;
        if (a.type === 3 && a.metadata?.durationSeconds) return `> ${name} (${a.metadata.durationSeconds}s)`;
        return `> ${name}`;
    });

    const presets = rule.triggerMetadata?.presets ?? [];
    const keywords = rule.triggerMetadata?.keywordFilter ?? [];

    const detailLines = [
        `**Name:** ${rule.name}`,
        `**Trigger:** ${triggerName}`,
        `**Enabled:** ${rule.enabled ? EMOJI.yes : EMOJI.no}`,
        presets.length ? `**Presets:** ${presets.map(p => AUTOMOD_PRESET_NAMES[p] ?? 'Unknown').join(', ')}` : null,
        keywords.length ? `**Keywords:** ${keywords.slice(0, 5).map(k => `\`${k}\``).join(', ')}${keywords.length > 5 ? ` +${keywords.length - 5} more` : ''}` : null,
        `**Actions:**\n${actionLines.join('\n')}`,
        rule.exemptRoles.size ? `**Exempt Roles:**\n${[...rule.exemptRoles.values()].map(r => `> <@&${r.id}>`).join('\n')}` : null,
        (() => {
            const channels = [...rule.exemptChannels.values()].filter(c => c.type !== ChannelType.GuildCategory);
            return channels.length ? `**Exempt Channels:**\n${channels.map(c => `> <#${c.id}>`).join('\n')}` : null;
        })(),
        (() => {
            const categories = [...rule.exemptChannels.values()].filter(c => c.type === ChannelType.GuildCategory);
            return categories.length ? `**Exempt Categories:**\n${categories.map(c => `> ${c.name}`).join('\n')}` : null;
        })(),
        `**ID:** \`${rule.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Created`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleCreate', container);
}

async function sendAutoModRuleDelete(rule, client) {
    const guildId = rule.guild?.id ?? rule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleDelete);
    const executor = entry?.executor ?? null;

    const triggerName = AUTOMOD_TRIGGER_NAMES[rule.triggerType] ?? 'Unknown';

    const actionLines = rule.actions.map(a => {
        const name = AUTOMOD_ACTION_NAMES[a.type] ?? 'Unknown';
        if (a.type === 2 && a.metadata?.channelId) return `> ${name} (<#${a.metadata.channelId}>)`;
        if (a.type === 3 && a.metadata?.durationSeconds) return `> ${name} (${a.metadata.durationSeconds}s)`;
        return `> ${name}`;
    });

    const presets = rule.triggerMetadata?.presets ?? [];
    const keywords = rule.triggerMetadata?.keywordFilter ?? [];

    const detailLines = [
        `**Name:** ${rule.name}`,
        `**Trigger:** ${triggerName}`,
        `**Enabled:** ${rule.enabled ? EMOJI.yes : EMOJI.no}`,
        presets.length ? `**Presets:** ${presets.map(p => AUTOMOD_PRESET_NAMES[p] ?? 'Unknown').join(', ')}` : null,
        keywords.length ? `**Keywords:** ${keywords.slice(0, 5).map(k => `\`${k}\``).join(', ')}${keywords.length > 5 ? ` +${keywords.length - 5} more` : ''}` : null,
        `**Actions:**\n${actionLines.join('\n')}`,
        rule.exemptRoles.size ? `**Exempt Roles:**\n${[...rule.exemptRoles.values()].map(r => `> <@&${r.id}>`).join('\n')}` : null,
        (() => {
            const channels = [...rule.exemptChannels.values()].filter(c => c.type !== ChannelType.GuildCategory);
            return channels.length ? `**Exempt Channels:**\n${channels.map(c => `> <#${c.id}>`).join('\n')}` : null;
        })(),
        (() => {
            const categories = [...rule.exemptChannels.values()].filter(c => c.type === ChannelType.GuildCategory);
            return categories.length ? `**Exempt Categories:**\n${categories.map(c => `> ${c.name}`).join('\n')}` : null;
        })(),
        `**ID:** \`${rule.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Deleted`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleDelete', container);
}

async function sendAutoModRuleActionsUpdate(oldRule, newRule, client) {
    const guildId = newRule.guild?.id ?? newRule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleUpdate);
    const executor = entry?.executor ?? null;

    const fmtActions = actions => actions.map(a => {
        const name = AUTOMOD_ACTION_NAMES[a.type] ?? 'Unknown';
        if (a.type === 2 && a.metadata?.channelId) return `> ${name} (<#${a.metadata.channelId}>)`;
        if (a.type === 3 && a.metadata?.durationSeconds) return `> ${name} (${a.metadata.durationSeconds}s)`;
        return `> ${name}`;
    }).join('\n');

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Actions Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            [
                `**Name:** ${newRule.name}`,
                `**Before:**\n${fmtActions(oldRule.actions)}`,
                `**After:**\n${fmtActions(newRule.actions)}`,
                `**ID:** \`${newRule.id}\``,
            ].join('\n')
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleActionsUpdate', container);
}

async function sendAutoModRuleContentUpdate(oldRule, newRule, client) {
    const guildId = newRule.guild?.id ?? newRule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleUpdate);
    const executor = entry?.executor ?? null;

    const diffList = (oldArr, newArr) => {
        const added = newArr.filter(x => !oldArr.includes(x));
        const removed = oldArr.filter(x => !newArr.includes(x));
        return { added, removed };
    };

    const oldMeta = oldRule.triggerMetadata ?? {};
    const newMeta = newRule.triggerMetadata ?? {};

    const detailLines = [`**Name:** ${newRule.name}`];

    const kwDiff = diffList(oldMeta.keywordFilter ?? [], newMeta.keywordFilter ?? []);
    if (kwDiff.added.length) detailLines.push(`**Keywords Added:**\n${kwDiff.added.slice(0, 5).map(k => `> \`${k}\``).join('\n')}${kwDiff.added.length > 5 ? `\n> +${kwDiff.added.length - 5} more` : ''}`);
    if (kwDiff.removed.length) detailLines.push(`**Keywords Removed:**\n${kwDiff.removed.slice(0, 5).map(k => `> \`${k}\``).join('\n')}${kwDiff.removed.length > 5 ? `\n> +${kwDiff.removed.length - 5} more` : ''}`);

    const rxDiff = diffList(oldMeta.regexPatterns ?? [], newMeta.regexPatterns ?? []);
    if (rxDiff.added.length) detailLines.push(`**Regex Added:**\n${rxDiff.added.map(r => `> \`${r}\``).join('\n')}`);
    if (rxDiff.removed.length) detailLines.push(`**Regex Removed:**\n${rxDiff.removed.map(r => `> \`${r}\``).join('\n')}`);

    const alDiff = diffList(oldMeta.allowList ?? [], newMeta.allowList ?? []);
    if (alDiff.added.length) detailLines.push(`**Allow List Added:**\n${alDiff.added.slice(0, 5).map(k => `> \`${k}\``).join('\n')}${alDiff.added.length > 5 ? `\n> +${alDiff.added.length - 5} more` : ''}`);
    if (alDiff.removed.length) detailLines.push(`**Allow List Removed:**\n${alDiff.removed.slice(0, 5).map(k => `> \`${k}\``).join('\n')}${alDiff.removed.length > 5 ? `\n> +${alDiff.removed.length - 5} more` : ''}`);

    const prDiff = diffList(oldMeta.presets ?? [], newMeta.presets ?? []);
    if (prDiff.added.length) detailLines.push(`**Presets Added:** ${prDiff.added.map(p => AUTOMOD_PRESET_NAMES[p] ?? 'Unknown').join(', ')}`);
    if (prDiff.removed.length) detailLines.push(`**Presets Removed:** ${prDiff.removed.map(p => AUTOMOD_PRESET_NAMES[p] ?? 'Unknown').join(', ')}`);

    if ((oldMeta.mentionTotalLimit ?? null) !== (newMeta.mentionTotalLimit ?? null)) {
        detailLines.push(`**Mention Limit:** ${oldMeta.mentionTotalLimit ?? 'None'} → ${newMeta.mentionTotalLimit ?? 'None'}`);
    }
    if ((oldMeta.mentionRaidProtectionEnabled ?? false) !== (newMeta.mentionRaidProtectionEnabled ?? false)) {
        detailLines.push(`**Raid Protection:** ${oldMeta.mentionRaidProtectionEnabled ? EMOJI.yes : EMOJI.no} → ${newMeta.mentionRaidProtectionEnabled ? EMOJI.yes : EMOJI.no}`);
    }

    if (detailLines.length === 1) return;
    detailLines.push(`**ID:** \`${newRule.id}\``);

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Content Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleContentUpdate', container);
}

async function sendAutoModRuleRolesUpdate(oldRule, newRule, client) {
    const guildId = newRule.guild?.id ?? newRule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleUpdate);
    const executor = entry?.executor ?? null;

    const oldRoles = oldRule.exemptRoles;
    const newRoles = newRule.exemptRoles;
    const added = [...newRoles.values()].filter(r => !oldRoles.has(r.id));
    const removed = [...oldRoles.values()].filter(r => !newRoles.has(r.id));
    if (!added.length && !removed.length) return;

    const detailLines = [
        `**Name:** ${newRule.name}`,
        added.length ? `**Added:**\n${added.map(r => `> <@&${r.id}>`).join('\n')}` : null,
        removed.length ? `**Removed:**\n${removed.map(r => `> <@&${r.id}>`).join('\n')}` : null,
        `**ID:** \`${newRule.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Exempt Roles Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleRolesUpdate', container);
}

async function sendAutoModRuleChannelsUpdate(oldRule, newRule, client) {
    const guildId = newRule.guild?.id ?? newRule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleUpdate);
    const executor = entry?.executor ?? null;

    const oldChannels = oldRule.exemptChannels;
    const newChannels = newRule.exemptChannels;
    const added = [...newChannels.values()].filter(c => !oldChannels.has(c.id));
    const removed = [...oldChannels.values()].filter(c => !newChannels.has(c.id));
    if (!added.length && !removed.length) return;

    const fmtChannel = c => c.type === ChannelType.GuildCategory ? `> ${c.name}` : `> <#${c.id}>`;

    const detailLines = [
        `**Name:** ${newRule.name}`,
        added.length ? `**Added:**\n${added.map(fmtChannel).join('\n')}` : null,
        removed.length ? `**Removed:**\n${removed.map(fmtChannel).join('\n')}` : null,
        `**ID:** \`${newRule.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Exempt Channels Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleChannelsUpdate', container);
}

async function sendAutoModRuleNameUpdate(oldRule, newRule, client) {
    const guildId = newRule.guild?.id ?? newRule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleUpdate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Name Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            [
                `**Name:** ${oldRule.name} → ${newRule.name}`,
                `**ID:** \`${newRule.id}\``,
            ].join('\n')
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleNameUpdate', container);
}

async function sendAutoModRuleToggle(oldRule, newRule, client) {
    const guildId = newRule.guild?.id ?? newRule.guildId;
    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.AutoModerationRuleUpdate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(newRule.enabled ? 0x57f287 : 0xe24b4a)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** AutoMod Rule Toggled`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            [
                `**Name:** ${newRule.name}`,
                `**Enabled:** ${newRule.enabled ? EMOJI.yes : EMOJI.no}`,
                `**ID:** \`${newRule.id}\``,
            ].join('\n')
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'discordAutoMod', 'autoModRuleToggle', container);
}

async function sendWebhookCreate(entry, guildId, client) {
    const executor = entry.executor ?? null;
    const changes = entry.changes ?? [];
    const name = changeVal(changes, 'name', 'new') ?? 'Unknown';
    const channelId = changeVal(changes, 'channel_id', 'new');
    const type = changeVal(changes, 'type', 'new');
    const avatarHash = changeVal(changes, 'avatar_hash', 'new');
    const avatarURL = avatarHash ? `https://cdn.discordapp.com/avatars/${entry.targetId}/${avatarHash}.png` : null;

    const detailLines = [
        `**Name:** ${name}`,
        channelId ? `**Channel:** <#${channelId}>` : null,
        type ? `**Type:** ${WEBHOOK_TYPE_NAMES[type] ?? 'Unknown'}` : null,
        `**ID:** \`${entry.targetId}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Webhook Created`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

    if (avatarURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(detailLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(avatarURL))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')));
    }
    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'webhooks', 'webhookCreate', container);
}

async function sendWebhookDelete(entry, guildId, client) {
    const executor = entry.executor ?? null;
    const changes = entry.changes ?? [];
    const name = changeVal(changes, 'name', 'old') ?? 'Unknown';
    const channelId = changeVal(changes, 'channel_id', 'old');

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Webhook Deleted`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Name:** ${name}`,
            channelId ? `**Channel:** <#${channelId}>` : null,
            `**ID:** \`${entry.targetId}\``,
        ].filter(Boolean).join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'webhooks', 'webhookDelete', container);
}

async function sendWebhookNameUpdate(entry, guildId, client) {
    const executor = entry.executor ?? null;
    const changes = entry.changes ?? [];
    const oldName = changeVal(changes, 'name', 'old') ?? 'Unknown';
    const newName = changeVal(changes, 'name', 'new') ?? 'Unknown';
    const channelId = changeVal(changes, 'channel_id', 'new') ?? changeVal(changes, 'channel_id', 'old');

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Webhook Name Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Name:** ${oldName} → ${newName}`,
            channelId ? `**Channel:** <#${channelId}>` : null,
            `**ID:** \`${entry.targetId}\``,
        ].filter(Boolean).join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'webhooks', 'webhookNameUpdate', container);
}

async function sendWebhookAvatarUpdate(entry, guildId, client) {
    const executor = entry.executor ?? null;
    const changes = entry.changes ?? [];
    const newHash = changeVal(changes, 'avatar_hash', 'new');
    const avatarURL = newHash ? `https://cdn.discordapp.com/avatars/${entry.targetId}/${newHash}.png` : null;

    const nameFromChanges = changeVal(changes, 'name', 'new') ?? changeVal(changes, 'name', 'old');
    const guild = client.guilds.cache.get(guildId);
    const webhooks = nameFromChanges ? null : await guild?.fetchWebhooks().catch(() => null);
    const name = nameFromChanges ?? webhooks?.get(entry.targetId)?.name ?? 'Unknown';

    const contentLines = [
        `${EMOJI.logging} **|** Webhook Avatar Updated`,
        `**Name:** ${name}`,
        `**ID:** \`${entry.targetId}\``,
    ];

    const container = new ContainerBuilder().setAccentColor(0xfac775);
    if (avatarURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(contentLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(avatarURL))
        );
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(contentLines.join('\n')));
    }
    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'webhooks', 'webhookAvatarUpdate', container);
}

async function sendWebhookChannelUpdate(entry, guildId, client) {
    const executor = entry.executor ?? null;
    const changes = entry.changes ?? [];
    const oldChannelId = changeVal(changes, 'channel_id', 'old');
    const newChannelId = changeVal(changes, 'channel_id', 'new');
    const name = changeVal(changes, 'name', 'new') ?? changeVal(changes, 'name', 'old');

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Webhook Channel Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            name ? `**Name:** ${name}` : null,
            `**Channel:** ${oldChannelId ? `<#${oldChannelId}>` : 'Unknown'} → ${newChannelId ? `<#${newChannelId}>` : 'Unknown'}`,
            `**ID:** \`${entry.targetId}\``,
        ].filter(Boolean).join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'webhooks', 'webhookChannelUpdate', container);
}

async function sendWebhooksUpdate(channel, client) {
    const guildId = channel.guild?.id;
    if (!guildId) return;

    const now = Date.now();
    const threshold = 10000;

    const [createEntry, updateEntry, deleteEntry] = await Promise.all([
        fetchAuditEntry(client, guildId, AuditLogEvent.WebhookCreate),
        fetchAuditEntry(client, guildId, AuditLogEvent.WebhookUpdate),
        fetchAuditEntry(client, guildId, AuditLogEvent.WebhookDelete),
    ]);

    const candidates = [createEntry, updateEntry, deleteEntry]
        .filter(e => e && (now - e.createdTimestamp) < threshold);
    if (!candidates.length) return;

    candidates.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const entry = candidates[0];

    if (entry.action === AuditLogEvent.WebhookCreate) {
        await sendWebhookCreate(entry, guildId, client);
    } else if (entry.action === AuditLogEvent.WebhookDelete) {
        await sendWebhookDelete(entry, guildId, client);
    } else if (entry.action === AuditLogEvent.WebhookUpdate) {
        const changes = entry.changes ?? [];
        if (changes.some(c => c.key === 'name')) await sendWebhookNameUpdate(entry, guildId, client);
        if (changes.some(c => c.key === 'avatar_hash')) await sendWebhookAvatarUpdate(entry, guildId, client);
        if (changes.some(c => c.key === 'channel_id')) await sendWebhookChannelUpdate(entry, guildId, client);
    }
}

async function sendInviteCreate(invite, client) {
    const entry = await fetchAuditEntry(client, invite.guild.id, AuditLogEvent.InviteCreate);
    const executor = entry.executor ?? null;

    const maxUses = invite.maxUses === 0 ? 'Unlimited' : `${invite.maxUses}`;
    const maxAge = invite.maxAge === 0 ? 'Never' : `${invite.maxAge / 3600}h`;

    const detailLines = [
        `**Code:** \`${invite.code}\``,
        `**Channel:** ${invite.channel ? `${invite.channel.name} — <#${invite.channel.id}>` : 'Unknown'}`,
        `**Max Uses:** ${maxUses}`,
        `**Expires:** ${maxAge}`,
        `**Temporary Membership:** ${invite.temporary ? EMOJI.yes : EMOJI.no}`,
        `**URL:** ${invite.url}`,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Invite Created`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, invite.guild.id, 'invites', 'inviteCreate', container)
}

async function sendInviteDelete(invite, client) {
    const entry = await fetchAuditEntry(client, invite.guild.id, AuditLogEvent.InviteDelete);
    const executor = entry?.executor ?? null;

    const detailLines = [
        `**Code:** \`${invite.code}\``,
        `**Channel:** ${invite.channel ? `${invite.channel.name} — <#${invite.channel.id}>` : 'Unknown'}`,
        `**Uses:** ${invite.uses ?? 0}`,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Invite Deleted`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, invite.guild.id, 'invites', 'inviteDelete', container);
}

async function sendScheduledEventCreate(event, client) {
    const entry = await fetchAuditEntry(client, event.guildId, AuditLogEvent.GuildScheduledEventCreate);
    const executor = entry?.executor ?? null;

    const coverURL = event.coverImageURL({ size: 128 });
    const startTs = event.scheduledStartTimestamp ? `<t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>` : 'Unknown';
    const endTs = event.scheduledEndTimestamp ? `<t:${Math.floor(event.scheduledEndTimestamp / 1000)}:F>` : null;

    const header = `${EMOJI.logging} **|** Event Created`;
    const detailLines = [
        `**Name:** ${event.name}`,
        event.description ? `**Description:** ${event.description}` : null,
        `**Location:** ${formatEventLocation(event)}`,
        `**Type:** ${SCHEDULED_EVENT_ENTITY_TYPE_NAMES[event.entityType] ?? 'Unknown'}`,
        `**Starts:** ${startTs}`,
        endTs ? `**Ends:** ${endTs}` : null,
        `**ID:** \`${event.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder().setAccentColor(0x57f287);

    if (coverURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent([header, ...detailLines].join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(coverURL))
        );
    } else {
        container
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, event.guildId, 'events', 'scheduledEventCreate', container);
}

async function sendScheduledEventDelete(event, client) {
    const entry = await fetchAuditEntry(client, event.guildId, AuditLogEvent.GuildScheduledEventDelete);
    const executor = entry?.executor ?? null;

    const detailLines = [
        `**Name:** ${event.name}`,
        event.description ? `**Description:** ${event.description}` : null,
        `**Status:** ${SCHEDULED_EVENT_STATUS_NAMES[event.status] ?? 'Unknown'}`,
        `**ID:** \`${event.id}\``,
    ].filter(Boolean);

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event Deleted`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, event.guildId, 'events', 'scheduledEventDelete', container);
}

async function sendScheduledEventNameUpdate(oldEvent, newEvent, client) {
    const entry = await fetchAuditEntry(client, newEvent.guildId, AuditLogEvent.GuildScheduledEventUpdate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event Name Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Name:** ${oldEvent.name} → ${newEvent.name}`,
            `**ID:** \`${newEvent.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventNameUpdate', container);
}

async function sendScheduledEventDescriptionUpdate(oldEvent, newEvent, client) {
    const entry = await fetchAuditEntry(client, newEvent.guildId, AuditLogEvent.GuildScheduledEventUpdate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event Description Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${newEvent.name}`,
            `**Description:** ${oldEvent.description || 'None'} → ${newEvent.description || 'None'}`,
            `**ID:** \`${newEvent.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventDescriptionUpdate', container);
}

async function sendScheduledEventLocationUpdate(oldEvent, newEvent, client) {
    const entry = await fetchAuditEntry(client, newEvent.guildId, AuditLogEvent.GuildScheduledEventUpdate);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event Location Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${newEvent.name}`,
            `**Location:** ${formatEventLocation(oldEvent)} → ${formatEventLocation(newEvent)}`,
            `**ID:** \`${newEvent.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventLocationUpdate', container);
}

async function sendScheduledEventPrivacyLevelUpdate(oldEvent, newEvent, client) {
    const entry = await fetchAuditEntry(client, newEvent.guildId, AuditLogEvent.GuildScheduledEventUpdate);
    const executor = entry?.executor ?? null;

    const privacyName = level => level === 2 ? 'Guild Only' : `Unknown (${level})`;

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event Privacy Level Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${newEvent.name}`,
            `**Privacy:** ${privacyName(oldEvent.privacyLevel)} → ${privacyName(newEvent.privacyLevel)}`,
            `**ID:** \`${newEvent.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventPrivacyLevelUpdate', container);
}

async function sendScheduledEventStartTimeUpdate(oldEvent, newEvent, client) {
    const entry = await fetchAuditEntry(client, newEvent.guildId, AuditLogEvent.GuildScheduledEventUpdate);
    const executor = entry?.executor ?? null;

    const fmt = ts => ts ? `<t:${Math.floor(ts / 1000)}:F>` : 'None';

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event Start Time Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${newEvent.name}`,
            `**Start:** ${fmt(oldEvent.scheduledStartTimestamp)} → ${fmt(newEvent.scheduledStartTimestamp)}`,
            `**ID:** \`${newEvent.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventStartTimeUpdate', container);
}

async function sendScheduledEventEndTimeUpdate(oldEvent, newEvent, client) {
    const entry = await fetchAuditEntry(client, newEvent.guildId, AuditLogEvent.GuildScheduledEventUpdate);
    const executor = entry?.executor ?? null;

    const fmt = ts => ts ? `<t:${Math.floor(ts / 1000)}:F>` : 'None';

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event End Time Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${newEvent.name}`,
            `**End:** ${fmt(oldEvent.scheduledEndTimestamp)} → ${fmt(newEvent.scheduledEndTimestamp)}`,
            `**ID:** \`${newEvent.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventEndTimeUpdate', container);
}

async function sendScheduledEventStatusUpdate(oldEvent, newEvent, client) {
    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event Status Updated`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${newEvent.name}`,
            `**Status:** ${SCHEDULED_EVENT_STATUS_NAMES[oldEvent.status] ?? 'Unknown'} → ${SCHEDULED_EVENT_STATUS_NAMES[newEvent.status] ?? 'Unknown'}`,
            `**ID:** \`${newEvent.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer()));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventStatusUpdate', container);
}

async function sendScheduledEventImageUpdate(oldEvent, newEvent, client) {
    const entry = await fetchAuditEntry(client, newEvent.guildId, AuditLogEvent.GuildScheduledEventUpdate);
    const executor = entry?.executor ?? null;

    const coverURL = newEvent.coverImageURL({ size: 256 });
    const header = `${EMOJI.logging} **|** Event Image Updated`;

    const container = new ContainerBuilder().setAccentColor(0xfac775);

    if (coverURL) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent([
                    header,
                    `**Event:** ${newEvent.name}`,
                    `**ID:** \`${newEvent.id}\``,
                ].join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(coverURL))
        );
    } else {
        container
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent([
                `**Event:** ${newEvent.name}`,
                `**Image:** Removed`,
                `**ID:** \`${newEvent.id}\``,
            ].join('\n')));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, newEvent.guildId, 'events', 'scheduledEventImageUpdate', container);
}

async function sendScheduledEventUserAdd(event, user, client) {
    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event User Subscribed`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${event.name}`,
            `**User:** ${user.username} — <@${user.id}>`,
            `**User ID:** \`${user.id}\``,
            `**Event ID:** \`${event.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer()));

    await sendToLog(client, event.guildId, 'events', 'scheduledEventUserAdd', container);
}

async function sendScheduledEventUserRemove(event, user, client) {
    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Event User Unsubscribed`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Event:** ${event.name}`,
            `**User:** ${user.username} — <@${user.id}>`,
            `**User ID:** \`${user.id}\``,
            `**Event ID:** \`${event.id}\``,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer()));

    await sendToLog(client, event.guildId, 'events', 'scheduledEventUserRemove', container);
}

function truncate(str, max = 1000) {
    return str.length > max ? str.slice(0, max) + '…' : str;
}

async function sendMessageDelete(message, client) {
    const guildId = message.guildId;
    if (!guildId) return;

    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.MessageDelete);
    const executor = entry?.executor ?? null;

    const author = message.partial ? null : message.author;
    const content = message.partial ? null : (message.content || null);

    const detailLines = [
        author ? `**Author:** ${author.username} — <@${author.id}>` : `**Author:** *Unknown*`,
        `**Channel:** <#${message.channelId}>`,
        content ? `**Content:** ${truncate(content)}` : `**Content:** *Not cached*`,
        `**Message ID:** \`${message.id}\``,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Message Deleted`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'messages', 'messageDelete', container);
}

async function sendMessageBulkDelete(messages, channel, client) {
    const guildId = channel.guildId;
    if (!guildId) return;

    const entry = await fetchAuditEntry(client, guildId, AuditLogEvent.MessageBulkDelete);
    const executor = entry?.executor ?? null;

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Messages Bulk Deleted`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Channel:** ${channel.name} — <#${channel.id}>`,
            `**Count:** ${messages.size} messages`,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, guildId, 'messages', 'messageBulkDelete', container);
}

async function sendMessageEdit(oldMessage, newMessage, client) {
    const guildId = newMessage.guildId;
    if (!guildId) return;

    const oldContent = oldMessage.content || '*Empty*';
    const newContent = newMessage.content || '*Empty*';

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Message Edited`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Author:** ${newMessage.author.username} — <@${newMessage.author.id}>`,
            `**Channel:** <#${newMessage.channelId}>`,
            `**Content:** ${truncate(oldContent)} → ${truncate(newContent)}`,
            `**[Jump to Message](${newMessage.url})**`,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer()));

    await sendToLog(client, guildId, 'messages', 'messageEdit', container);
}

async function sendMessagePublish(oldMessage, newMessage, client) {
    const guildId = newMessage.guildId;
    if (!guildId) return;

    const content = newMessage.content || '*No text content*';

    const container = new ContainerBuilder()
        .setAccentColor(0x57f287)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Message Published`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**Author:** ${newMessage.author.username} — <@${newMessage.author.id}>`,
            `**Channel:** <#${newMessage.channelId}>`,
            `**Content:** ${truncate(content)}`,
            `**[Jump to Message](${newMessage.url})**`,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer()));

    await sendToLog(client, guildId, 'messages', 'messagePublish', container);
}

async function sendMessageCommand(message, client) {
    const guildId = message.guildId;
    if (!guildId) return;

    const isSlash = !!message.interaction;
    const user = isSlash ? message.interaction.user : message.author;
    const commandText = isSlash
        ? `\`/${message.interaction.commandName}\``
        : truncate(message.content);

    const container = new ContainerBuilder()
        .setAccentColor(0x5865f2)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${EMOJI.logging} **|** Message Sent Using Command`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `**User:** ${user.username} — <@${user.id}>`,
            `**Channel:** <#${message.channelId}>`,
            `**Type:** ${isSlash ? 'Slash Command' : 'Prefix Command'}`,
            `**Command:** ${commandText}`,
        ].join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer()));

    await sendToLog(client, guildId, 'messages', 'messageCommand', container);
}

export const loggingService = {
    // Integration/Application Return Functions
    integrationCreate: (integration, client) => sendIntegrationCreate(integration, client),
    integrationDelete: (integration, client) => sendIntegrationDelete(integration, client),
    applicationCommandPermissionsUpdate: (data, client) => sendApplicationCommandPermissionsUpdate(data, client),
    // Channel/Category Return Functions
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
    // Emoji Return Functions
    emojiCreate: (emoji, client) => sendEmojiCreate(emoji, client),
    emojiDelete: (emoji, client) => sendEmojiDelete(emoji, client),
    emojiNameUpdate: (oldEmoji, newEmoji, client) => sendEmojiNameUpdate(oldEmoji, newEmoji, client),
    emojiRolesUpdate: (oldEmoji, newEmoji, client) => sendEmojiRolesUpdate(oldEmoji, newEmoji, client),
    // Auto-Mod Return Functions
    autoModRuleCreate: (rule, client) => sendAutoModRuleCreate(rule, client),
    autoModRuleDelete: (rule, client) => sendAutoModRuleDelete(rule, client),
    autoModRuleActionsUpdate: (oldRule, newRule, client) => sendAutoModRuleActionsUpdate(oldRule, newRule, client),
    autoModRuleContentUpdate: (oldRule, newRule, client) => sendAutoModRuleContentUpdate(oldRule, newRule, client),
    autoModRuleRolesUpdate: (oldRule, newRule, client) => sendAutoModRuleRolesUpdate(oldRule, newRule, client),
    autoModRuleChannelsUpdate: (oldRule, newRule, client) => sendAutoModRuleChannelsUpdate(oldRule, newRule, client),
    autoModRuleNameUpdate: (oldRule, newRule, client) => sendAutoModRuleNameUpdate(oldRule, newRule, client),
    autoModRuleToggle: (oldRule, newRule, client) => sendAutoModRuleToggle(oldRule, newRule, client),
    // Webhook Return Function
    webhooksUpdate: (channel, client) => sendWebhooksUpdate(channel, client),
    // Message Return Functions
    messageDelete: (message, client) => sendMessageDelete(message, client),
    messageBulkDelete: (messages, channel, client) => sendMessageBulkDelete(messages, channel, client),
    messageEdit: (oldMessage, newMessage, client) => sendMessageEdit(oldMessage, newMessage, client),
    messagePublish: (oldMessage, newMessage, client) => sendMessagePublish(oldMessage, newMessage, client),
    messageCommand: (message, client) => sendMessageCommand(message, client),
    // Invite Return Functions
    inviteCreate: (channel, client) => sendInviteCreate(channel, client),
    inviteDelete: (channel, client) => sendInviteDelete(channel, client),
    // Event Return Functions
    scheduledEventCreate: (event, client) => sendScheduledEventCreate(event, client),
    scheduledEventDelete: (event, client) => sendScheduledEventDelete(event, client),
    scheduledEventNameUpdate: (oldEvent, newEvent, client) => sendScheduledEventNameUpdate(oldEvent, newEvent, client),
    scheduledEventDescriptionUpdate: (oldEvent, newEvent, client) => sendScheduledEventDescriptionUpdate(oldEvent, newEvent, client),
    scheduledEventLocationUpdate: (oldEvent, newEvent, client) => sendScheduledEventLocationUpdate(oldEvent, newEvent, client),
    scheduledEventPrivacyLevelUpdate: (oldEvent, newEvent, client) => sendScheduledEventPrivacyLevelUpdate(oldEvent, newEvent, client),
    scheduledEventStartTimeUpdate: (oldEvent, newEvent, client) => sendScheduledEventStartTimeUpdate(oldEvent, newEvent, client),
    scheduledEventEndTimeUpdate: (oldEvent, newEvent, client) => sendScheduledEventEndTimeUpdate(oldEvent, newEvent, client),
    scheduledEventStatusUpdate: (oldEvent, newEvent, client) => sendScheduledEventStatusUpdate(oldEvent, newEvent, client),
    scheduledEventImageUpdate: (oldEvent, newEvent, client) => sendScheduledEventImageUpdate(oldEvent, newEvent, client),
    scheduledEventUserAdd: (event, user, client) => sendScheduledEventUserAdd(event, user, client),
    scheduledEventUserRemove: (event, user, client) => sendScheduledEventUserRemove(event, user, client),
};
