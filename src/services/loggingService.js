import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MessageFlags,
    AuditLogEvent,
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

function formatPermission({ id, type, permission }) {
    const emoji = permission ? EMOJI.yes : EMOJI.no;
    if (type === 1) return `> <@&${id}> — ${emoji}`;
    if (type === 2) return `> <@${id}> — ${emoji}`;
    return `> <#${id}> — ${emoji}`;
}

function footer(executor = null) {
    const ts = `<t:${Math.floor(Date.now() / 1000)}:f>`;
    return executor ? `<@${executor.id}> • ${ts}` : `${ts}`;
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
            new TextDisplayBuilder().setContent(
                [
                    `${EMOJI.logging} **|** Application Removed`,
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

    const headerLines = [
        `${EMOJI.logging} **|** App Command Permissions Updated`,
        `**Name:** <@${data.applicationId}> — \`${data.applicationId}\``,
        commandName
            ? `**Command:** \`${data.id}\` — \`${commandName}\``
            : `**Command:** \`${data.id}\``,
    ];

    const changeLines = [
        `**Changes:**`,
        ...data.permissions.map(formatPermission),
    ];

    const container = new ContainerBuilder()
        .setAccentColor(0xfac775)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(changeLines.join('\n')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, data.guildId, 'applications', 'applicationCommandPermissionsUpdate', container);
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
                    `> **Name:** ${channel.name} — <#${channel.id}>`,
                    `> **Type:** ${typeName}`,
                    `> **Category:** ${parent}`,
                    `> **Priority:** ${channel.position + 1}`,
                    `> **Channel ID:** \`${channel.id}\``,
                ].join('\n')
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(footer(executor)));

    await sendToLog(client, channel.guild.id, 'channels', 'channelCreate', container);
}

async function sendChannelDelete(channel, client) {
    const entry = await fetchAuditEntry(client, channel.guild.id, AuditLogEvent.ChannelDelete);
    const executor = entry?.executor ?? null;

    const parent = channel.parent?.name ?? 'N/A';

    const container = new ContainerBuilder()
        .setAccentColor(0xe24b4a)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                [
                    `${EMOJI.logging} **|** Channel Deleted`,
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
    channelCreate: (channel, client) => sendChannelCreate(channel, client),
    channelDelete: (channel, client) => sendChannelDelete(channel, client),
};
