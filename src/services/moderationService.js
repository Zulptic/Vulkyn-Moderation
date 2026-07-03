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
import { addScore } from './accountStatusService.js';
import { shouldIgnoreLog } from './loggingService.js';
import { errorService } from './errorService.js';

const PUNISHMENT_TYPES = ['warn', 'mute', 'timeout', 'kick', 'ban', 'softban'];
const FAILED_LOG_RESULT = { infraction: null, modAction: null };

const DM_KEYS = {
    warn: 'dmOnWarn',
    mute: 'dmOnMute',
    timeout: 'dmOnTimeout',
    kick: 'dmOnKick',
    ban: 'dmOnBan',
};

const EMOJIS = {
    punish: '<:punishment_1:1497070437618684065><:punishment_2:1497070473010217061><:punishment_3:1497070518598238330>',
    unpunish: '<:punishment2_1:1497344429407735909><:punishment2_2:1497344449385205851><:punishment2_3:1497344463192854691>',
};

export async function logModAction(client, {
    guildId,
    action,
    moderatorId,
    targetId = null,
    reason = null,
    duration = null,
    proof = null,
    metadata = {},
}, options = {}) {
    try {
        let infraction = null;

        if (PUNISHMENT_TYPES.includes(action)) {
            infraction = await createInfraction(client, {
                guildId,
                userId: targetId,
                moderatorId,
                type: action,
                reason,
                duration,
                proof,
            });

            if (!options.skipAccountStatus && targetId) {
                await addScore(client, guildId, targetId, action).catch(async err => {
                    logger.warn('Account status update failed:', err);
                    await errorService.error(client, err, {
                        guildId,
                        source: 'moderation-service',
                        operation: 'update-account-status',
                        context: { action, targetId, moderatorId },
                    });
                });
            }
        }

        const modAction = await logModerationAction(client, {
            guildId,
            moderatorId,
            action,
            targetId,
            infractionId: infraction?.id || metadata?.infractionId || null,
            reason,
            metadata,
        });

        await postUnifiedModLog(client, {
            guildId,
            action,
            moderatorId,
            targetId,
            reason,
            duration,
            proof,
            infraction,
            metadata,
        }).catch(err => {
            logger.warn('Failed to post moderation log message:', err);
            return errorService.error(client, err, {
                guildId,
                source: 'moderation-service',
                operation: 'send-moderation-log',
                context: { action, targetId, moderatorId },
            });
        });

        return { infraction, modAction };

    } catch (err) {
        logger.error('Failed to log mod action:', err);
        await errorService.error(client, err, {
            guildId,
            source: 'moderation-service',
            operation: 'log-moderation-action',
            context: { action, targetId, moderatorId },
        });
        return { ...FAILED_LOG_RESULT };
    }
}

async function createInfraction(client, {
    guildId,
    userId,
    moderatorId,
    type,
    reason,
    duration,
    proof,
}) {
    const config = await getGuildConfig(guildId, client);

    let expiresAt = null;
    if (duration) {
        expiresAt = new Date(Date.now() + duration * 1000).toISOString();
    }

    const infraction = await insertInfraction(client.db, {
        guildId,
        userId,
        moderatorId,
        type,
        reason,
        duration,
        expiresAt,
        proof,
    });

    const dmKey = DM_KEYS[type];
    if (dmKey && config?.logging?.[dmKey]) {
        await dmUser(client, guildId, userId, infraction);
    }

    return infraction;
}

async function insertInfraction(db, params) {
    const dbClient = await db.connect();
    try {
        await dbClient.query('BEGIN');

        await dbClient.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [params.guildId]
        );

        const { rows: [{ next }] } = await dbClient.query(
            'SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM infractions WHERE guild_id = $1',
            [params.guildId]
        );

        const { rows } = await dbClient.query(
            `INSERT INTO infractions (guild_id, case_number, user_id, moderator_id, type, reason, duration, expires_at, proof)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
            [params.guildId, next, params.userId, params.moderatorId, params.type, params.reason, params.duration, params.expiresAt, params.proof ?? null]
        );

        await dbClient.query('COMMIT');
        return rows[0];
    } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
    } finally {
        dbClient.release();
    }
}

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
        await errorService.error(client, err, {
            guildId: data.guildId,
            source: 'moderation-service',
            operation: 'insert-moderation-action',
            context: {
                action: data.action,
                targetId: data.targetId,
                moderatorId: data.moderatorId,
                infractionId: data.infractionId,
            },
        });
        return null;
    }
}

async function postUnifiedModLog(client, {
    guildId,
    action,
    moderatorId,
    targetId,
    reason,
    duration,
    proof,
    infraction,
    metadata = {},
}) {
    const config = await getGuildConfig(guildId, client);
    if (!config?.logging?.enabled) return;

    // Map action to logging config key
    const actionToLogKey = {
        warn: 'warnAdd',
        mute: 'muteAdd',
        timeout: 'warnAdd', // timeouts log under moderation too
        kick: 'kickAdd',
        softban: 'kickAdd',
        ban: 'banAdd',
        unwarn: 'warnRemove',
        unmute: 'muteRemove',
        untimeout: 'warnRemove',
        unban: 'banRemove',
    };

    const logKey = actionToLogKey[action];
    const modLogging = config.logging.moderation || {};
    const destinationConfig = modLogging[logKey];
    const eventConfig = modLogging.eventIgnores?.[logKey]
        ?? (destinationConfig && typeof destinationConfig === 'object' ? destinationConfig : {});

    if (await shouldIgnoreLog(
        client,
        guildId,
        config.logging,
        modLogging,
        eventConfig,
        { userIds: [moderatorId, targetId] }
    )) return;

    const channelId = typeof destinationConfig === 'string'
        ? destinationConfig
        : destinationConfig?.channelId ?? modLogging.categoryChannel;
    if (!channelId) return;

    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    const user = await client.users.fetch(targetId).catch(() => null);

    const isReversal = ['unban', 'unmute', 'untimeout'].includes(action);
    const emoji = isReversal ? EMOJIS.unpunish : EMOJIS.punish;
    const color = isReversal ? 0x2b8a3e : 0xbc2b2a;

    let caseNumber = infraction?.case_number;
    if (!caseNumber && metadata?.infractionId) {
        const { rows } = await client.db.query(
            `SELECT case_number FROM infractions WHERE id = $1`,
            [metadata.infractionId]
        );
        caseNumber = rows[0]?.case_number;
    }

    let title = capitalize(action);
    if (caseNumber) title += ` #${caseNumber}`;

    let text = `${emoji} **|** ${title}\n\n**User:** <@${targetId}> (${targetId})`;

    if (reason) text += `\n**Reason:** ${reason}`;

    if (!isReversal && duration && ['mute', 'timeout', 'ban'].includes(action)) {
        text += `\n**Duration:** ${formatDuration(duration)}`;
    }

    if (proof) text += `\n**Proof:** ${proof}`;

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
                `-# **@${moderator}** — <t:${Math.floor(Date.now() / 1000)}:f>`
            )
        );

    await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
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

        const config = await getGuildConfig(guildId, client);
        const preposition = infraction.type === 'kick' ? 'from' : 'in';

        let detailsText = `**Reason:** ${infraction.reason}`;

        if (infraction.duration && ['mute', 'timeout', 'ban'].includes(infraction.type)) {
            detailsText += `\n**Duration:** ${formatDuration(infraction.duration)}`;
        }

        detailsText += `\n**Case:** #${infraction.case_number}`;

        let footerText;
        if (config?.logging?.showModInDm && infraction.moderator_id) {
            const moderator = (await client.users.fetch(infraction.moderator_id).catch(() => null))?.username ?? 'Unknown';
            footerText = `-# **@${moderator}** — <t:${Math.floor(Date.now() / 1000)}:f>`;
        } else {
            footerText = `-# <t:${Math.floor(Date.now() / 1000)}:f>`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(0xbc2b2a)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`${EMOJIS.punish} **|** You have been ${formatAction(infraction.type)} ${preposition} **${guild.name}**`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(detailsText)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(footerText)
            );

        try {
            await user.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (err) {
            // Discord code 50007 means the user has DMs closed; this is expected.
            if (Number(err?.code) !== 50007) {
                await errorService.error(client, err, {
                    guildId,
                    source: 'moderation-service',
                    operation: 'send-punishment-dm',
                    context: { userId, infractionId: infraction.id },
                });
            }
        }
    } catch (err) {
        logger.warn(`Could not DM user ${userId}:`, err);
    }
}

function formatAction(type) {
    const actions = {
        warn: 'warned',
        mute: 'muted',
        timeout: 'timed out',
        kick: 'kicked',
        softban: 'softbanned',
        ban: 'banned',
    };
    return actions[type] || type;
}
