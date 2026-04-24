import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MessageFlags
} from 'discord.js';

import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';

const PUNISHMENT_TYPES = ['warn', 'mute', 'timeout', 'kick', 'ban'];

const DM_KEYS = {
    warn: 'dmOnWarn',
    mute: 'dmOnMute',
    timeout: 'dmOnTimeout',
    kick: 'dmOnKick',
    ban: 'dmOnBan',
};

/*
 * MAIN ENTRY POINT
 */
export async function logModAction(client, {
    guildId,
    action,
    moderatorId,
    targetId = null,
    reason = null,
    duration = null,
    metadata = {},
}) {
    try {
        let infraction = null;

        // 1. Create infraction if needed
        if (PUNISHMENT_TYPES.includes(action)) {
            infraction = await createInfraction(client, {
                guildId,
                userId: targetId,
                moderatorId,
                type: action,
                reason,
                duration,
            });
        }

        // 2. Log DB action
        const modAction = await logModerationAction(client, {
            guildId,
            moderatorId,
            action,
            targetId,
            infractionId: infraction?.id || null,
            reason,
            metadata,
        });

        // 3. Send mod log
        await postUnifiedModLog(client, {
            guildId,
            action,
            moderatorId,
            targetId,
            reason,
            duration,
            infraction,
        });

        return { infraction, modAction };

    } catch (err) {
        logger.error('Failed to log mod action:', err);
        return null;
    }
}

/*
 * Create infraction (NO MOD LOG HERE)
 */
async function createInfraction(client, {
    guildId,
    userId,
    moderatorId,
    type,
    reason,
    duration,
}) {
    const config = await getGuildConfig(guildId, client);

    let expiresAt = null;
    if (duration) {
        expiresAt = new Date(Date.now() + duration * 1000).toISOString();
    }

    const caseNumber = await getNextCaseNumber(guildId, client.db);

    const { rows } = await client.db.query(
        `INSERT INTO infractions 
        (guild_id, case_number, user_id, moderator_id, type, reason, duration, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *`,
        [guildId, caseNumber, userId, moderatorId, type, reason, duration, expiresAt]
    );

    const infraction = rows[0];

    // DM still happens here
    const dmKey = DM_KEYS[type];
    if (dmKey && config?.modLog?.[dmKey]) {
        await dmUser(client, guildId, userId, infraction);
    }

    return infraction;
}

/*
 * DB logging
 */
export async function logModerationAction(client, data) {
    try {
        const { rows } = await client.db.query(
            `INSERT INTO moderation_actions
             (guild_id, moderator_id, action, target_id, infraction_id, reason, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
                 RETURNING *`,
            [
                data.guildId,
                data.moderatorId,
                data.action,
                data.targetId,
                data.infractionId,
                data.reason,
                JSON.stringify(data.metadata || {}),
            ]
        );

        return rows[0];
    } catch (err) {
        logger.error('Failed to log moderation action:', err);
        return null;
    }
}

/*
 * Unified mod log sender
 */
async function postUnifiedModLog(client, {
    guildId,
    action,
    moderatorId,
    targetId,
    reason,
    duration,
    infraction,
}) {
    const config = await getGuildConfig(guildId, client);
    if (!config?.modLog?.channel) return;

    const channel = client.channels.cache.get(config.modLog.channel);
    if (!channel) return;

    const user = await client.users.fetch(targetId).catch(() => null);

    const isReversal = ['unban', 'unmute', 'untimeout'].includes(action);
    const color = isReversal ? 0x2b8a3e : 0xbc2b2a;

    let title = capitalize(action);
    if (infraction?.case_number) {
        title += ` #${infraction.case_number}`;
    }

    let text =
        `<:punishment_1:1497070437618684065><:punishment_2:1497070473010217061><:punishment_3:1497070518598238330> **|** ${title}\n\n` +
        `**User:** <@${targetId}> (${targetId})`;

    if (reason) text += `\n**Reason:** ${reason}`;

    if (!isReversal && duration && ['mute','timeout','ban'].includes(action)) {
        text += `\n**Duration:** ${formatDuration(duration)}`;
    }

    const moderator = moderatorId
        ? (await client.users.fetch(moderatorId).catch(() => null))?.username ?? 'Unknown'
        : 'Automated';

    const section = new SectionBuilder()
        .addTextDisplayComponents(td => td.setContent(text))
        .setThumbnailAccessory(thumbnail =>
            thumbnail.setURL(user?.displayAvatarURL() ?? 'https://cdn.discordapp.com/embed/avatars/0.png')
        );

    const container = new ContainerBuilder()
        .setAccentColor(color)
        .addSectionComponents(section)
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# **@${moderator}** — <t:${Math.floor(Date.now()/1000)}:f>`
            )
        );

    await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

/*
 * Helpers
 */
async function getNextCaseNumber(guildId, db) {
    const { rows } = await db.query(
        'SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM infractions WHERE guild_id = $1',
        [guildId]
    );
    return rows[0].next;
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function dmUser(client, guildId, userId, infraction) {
    try {
        const guild = client.guilds.cache.get(guildId);
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user || !guild) return;

        const container = new ContainerBuilder()
            .setAccentColor(0xbc2b2a)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `You have been ${infraction.type} in **${guild.name}**\n**Reason:** ${infraction.reason}`
                )
            );

        await user.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
    } catch (err) {
        logger.warn(`DM failed:`, err);
    }
}