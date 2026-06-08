import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    MessageFlags,
} from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';

const SCORED_ACTIONS = new Set(['warn', 'mute', 'timeout', 'kick', 'ban', 'softban']);
const STALE_THRESHOLD_INTERVAL = '5 minutes';
const THRESHOLD_RETRY_LIMIT = 25;

const PUNISH_EMOJI = '<:punishment_1:1497070437618684065><:punishment_2:1497070473010217061><:punishment_3:1497070518598238330>';

function matchField(field, value) {
    if (field === '*') return true;
    if (field.includes(',')) return field.split(',').some(v => parseInt(v, 10) === value);
    if (field.includes('-')) {
        const [start, end] = field.split('-').map(Number);
        return value >= start && value <= end;
    }
    if (field.startsWith('*/')) {
        return value % parseInt(field.slice(2), 10) === 0;
    }
    return parseInt(field, 10) === value;
}

function matchesCron(cronStr, timezone = 'UTC') {
    const parts = cronStr.trim().split(/\s+/);
    if (parts.length !== 5) return false;

    let timeParts;
    try {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            minute: 'numeric',
            hour: 'numeric',
            day: 'numeric',
            month: 'numeric',
            weekday: 'short',
            hour12: false,
        });
        const raw = Object.fromEntries(fmt.formatToParts(new Date()).map(({ type, value }) => [type, value]));
        const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        timeParts = {
            minute: parseInt(raw.minute, 10),
            hour: parseInt(raw.hour, 10) % 24,
            day: parseInt(raw.day, 10),
            month: parseInt(raw.month, 10),
            weekday: weekdays.indexOf(raw.weekday),
        };
    } catch {
        const d = new Date();
        timeParts = {
            minute: d.getUTCMinutes(),
            hour: d.getUTCHours(),
            day: d.getUTCDate(),
            month: d.getUTCMonth() + 1,
            weekday: d.getUTCDay(),
        };
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    return (
        matchField(minute, timeParts.minute) &&
        matchField(hour, timeParts.hour) &&
        matchField(dayOfMonth, timeParts.day) &&
        matchField(month, timeParts.month) &&
        matchField(dayOfWeek, timeParts.weekday)
    );
}

export async function addScore(client, guildId, userId, action) {
    if (!SCORED_ACTIONS.has(action)) return;

    const config = await getGuildConfig(guildId, client);
    const asConfig = config?.accountStatus;
    if (!asConfig?.enabled) return;

    const weight = asConfig.weights?.[action] ?? 0;
    if (weight <= 0) return;

    const threshold = asConfig.threshold;
    if (!threshold || threshold <= 0) return;

    try {
        const { rows } = await client.db.query(
            `INSERT INTO account_status (guild_id, user_id, score, last_infraction)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (guild_id, user_id) DO UPDATE
             SET score = account_status.score + $3, last_infraction = NOW()
             RETURNING score`,
            [guildId, userId, weight]
        );

        const newScore = Number(rows[0]?.score ?? 0);
        if (newScore >= threshold) {
            await processThreshold(client, guildId, userId, asConfig);
        }
    } catch (err) {
        logger.error(`Account status update failed for ${userId} in ${guildId}:`, err);
    }
}

async function processThreshold(client, guildId, userId, asConfig) {
    const action = normalizeThresholdAction(asConfig.thresholdAction);
    const claim = await claimThreshold(client, guildId, userId, asConfig.threshold, action);
    if (!claim) return false;

    const claimedScore = Number(claim.claimed_score ?? 0);

    try {
        await performThresholdAction(client, guildId, userId, claimedScore, action, asConfig);
    } catch (err) {
        await markThresholdFailed(client, guildId, userId, err);
        logger.error(`Threshold action failed for ${userId} in ${guildId}:`, err);
        return false;
    }

    try {
        const logResult = await logThresholdAction(client, guildId, userId, claimedScore, action, asConfig);
        if (!logResult?.logged) {
            throw new Error('Threshold action could not be recorded');
        }
    } catch (err) {
        await markThresholdLoggingFailed(client, guildId, userId, claimedScore, err);
        logger.error(`Threshold action logging failed for ${userId} in ${guildId}:`, err);
        return false;
    }

    await markThresholdSucceeded(client, guildId, userId, claimedScore);
    await postConfiguredThresholdAlert(client, userId, claimedScore, asConfig);

    logger.info(`Account status threshold '${action}' triggered for ${userId} in ${guildId}`);
    return true;
}

async function claimThreshold(client, guildId, userId, threshold, action) {
    const dbClient = await client.db.connect();

    try {
        await dbClient.query('BEGIN');

        await dbClient.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`account-status:${guildId}:${userId}`]
        );

        const { rows } = await dbClient.query(
            `UPDATE account_status
             SET threshold_status = 'processing',
                 threshold_claimed_at = NOW(),
                 threshold_claimed_score = score,
                 threshold_action = $5,
                 threshold_error = NULL
             WHERE guild_id = $1
               AND user_id = $2
               AND score >= $3
               AND (
                 threshold_status = 'idle'
                 OR threshold_status = 'failed'
                 OR (
                   threshold_status = 'processing'
                   AND threshold_claimed_at < NOW() - ($4::text)::interval
                 )
               )
             RETURNING score AS claimed_score, threshold_action`,
            [guildId, userId, threshold, STALE_THRESHOLD_INTERVAL, action]
        );

        await dbClient.query('COMMIT');
        return rows[0] ?? null;
    } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
    } finally {
        dbClient.release();
    }
}

async function performThresholdAction(client, guildId, userId, score, action, asConfig) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        throw new Error(`Guild ${guildId} is not cached`);
    }

    const reason = `Account status threshold reached (${score.toFixed(1)}/${asConfig.threshold})`;

    if (action === 'none' || action === 'warn') return;

    const member = await guild.members.fetch(userId).catch(() => null);

    if (action === 'ban') {
        await guild.members.ban(userId, { reason });
        return;
    }

    if (action === 'kick') {
        if (!member) throw new Error('User is not in the server');
        await member.kick(reason);
        return;
    }

    if (action === 'mute') {
        const config = await getGuildConfig(guildId, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) throw new Error('No mute role configured');
        if (!member) throw new Error('User is not in the server');
        await member.roles.add(muteRoleId, reason);
        return;
    }

    throw new Error(`Unsupported threshold action '${action}'`);
}

async function logThresholdAction(client, guildId, userId, score, action, asConfig) {
    if (action === 'none') return { logged: true };

    const reason = `Account status threshold reached (${score.toFixed(1)}/${asConfig.threshold})`;

    // Dynamic import breaks the circular dependency with moderationService
    const { logModAction } = await import('./moderationService.js');
    const logResult = await logModAction(client, {
        guildId,
        action,
        moderatorId: null,
        targetId: userId,
        reason,
        metadata: { system: true, accountStatus: true },
    }, { skipAccountStatus: true });

    return {
        logged: Boolean(logResult?.infraction),
        logResult,
    };
}

async function markThresholdSucceeded(client, guildId, userId, claimedScore) {
    await client.db.query(
        `UPDATE account_status
         SET score = GREATEST(score - $3, 0),
             reset_at = NOW(),
             threshold_status = 'idle',
             threshold_processed_at = NOW(),
             threshold_error = NULL,
             threshold_claimed_score = NULL,
             threshold_action = NULL
         WHERE guild_id = $1
           AND user_id = $2`,
        [guildId, userId, claimedScore]
    );
}

async function markThresholdFailed(client, guildId, userId, err) {
    const message = formatThresholdError(err);

    await client.db.query(
        `UPDATE account_status
         SET threshold_status = 'failed',
             threshold_error = $3
         WHERE guild_id = $1
           AND user_id = $2`,
        [guildId, userId, message.slice(0, 1000)]
    );
}

async function markThresholdLoggingFailed(client, guildId, userId, claimedScore, err) {
    const message = formatThresholdError(err);

    await client.db.query(
        `UPDATE account_status
         SET score = GREATEST(score - $3, 0),
             reset_at = NOW(),
             threshold_status = 'logging_failed',
             threshold_processed_at = NOW(),
             threshold_error = $4
         WHERE guild_id = $1
           AND user_id = $2`,
        [guildId, userId, claimedScore, message.slice(0, 1000)]
    );
}

async function markThresholdLogRepaired(client, guildId, userId) {
    await client.db.query(
        `UPDATE account_status
         SET threshold_status = 'idle',
             threshold_processed_at = NOW(),
             threshold_error = NULL,
             threshold_claimed_score = NULL,
             threshold_action = NULL
         WHERE guild_id = $1
           AND user_id = $2`,
        [guildId, userId]
    );
}

async function markThresholdLogRepairFailed(client, guildId, userId, err) {
    const message = formatThresholdError(err);

    await client.db.query(
        `UPDATE account_status
         SET threshold_status = 'logging_failed',
             threshold_error = $3
         WHERE guild_id = $1
           AND user_id = $2`,
        [guildId, userId, message.slice(0, 1000)]
    );
}

async function postConfiguredThresholdAlert(client, userId, score, asConfig) {
    if (!asConfig.notifyChannelId) return;

    const channel = client.channels.cache.get(asConfig.notifyChannelId);
    if (!channel) return;

    await postThresholdAlert(client, channel, userId, score, asConfig).catch(err =>
        logger.warn(`Account status threshold alert failed for ${userId}:`, err)
    );
}

async function retryDueThresholds(client) {
    for (const [guildId] of client.guilds.cache) {
        const config = await getGuildConfig(guildId, client).catch(() => null);
        const asConfig = config?.accountStatus;

        if (!asConfig?.enabled || !asConfig.threshold || asConfig.threshold <= 0) continue;

        const { rows } = await client.db.query(
            `SELECT user_id
             FROM account_status
             WHERE guild_id = $1
               AND score >= $2
               AND (
                 threshold_status IN ('idle', 'failed')
                 OR (
                   threshold_status = 'processing'
                   AND threshold_claimed_at < NOW() - ($3::text)::interval
                 )
               )
             ORDER BY last_infraction ASC NULLS FIRST
             LIMIT $4`,
            [guildId, asConfig.threshold, STALE_THRESHOLD_INTERVAL, THRESHOLD_RETRY_LIMIT]
        );

        for (const row of rows) {
            await processThreshold(client, guildId, row.user_id, asConfig);
        }
    }
}

async function retryThresholdLoggingFailures(client) {
    for (const [guildId] of client.guilds.cache) {
        const config = await getGuildConfig(guildId, client).catch(() => null);
        const asConfig = config?.accountStatus;
        if (!asConfig?.enabled) continue;

        const { rows } = await client.db.query(
            `SELECT user_id
             FROM account_status
             WHERE guild_id = $1
               AND (
                 threshold_status = 'logging_failed'
                 OR (
                   threshold_status = 'logging'
                   AND threshold_claimed_at < NOW() - ($2::text)::interval
                 )
               )
             ORDER BY threshold_processed_at ASC NULLS FIRST
             LIMIT $3`,
            [guildId, STALE_THRESHOLD_INTERVAL, THRESHOLD_RETRY_LIMIT]
        );

        for (const row of rows) {
            await repairThresholdLog(client, guildId, row.user_id, asConfig);
        }
    }
}

async function repairThresholdLog(client, guildId, userId, asConfig) {
    const claim = await claimThresholdLogRepair(client, guildId, userId);
    if (!claim) return false;

    const claimedScore = Number(claim.threshold_claimed_score ?? 0);
    const action = normalizeThresholdAction(claim.threshold_action);
    const alertConfig = { ...asConfig, thresholdAction: action };

    try {
        const logResult = await logThresholdAction(client, guildId, userId, claimedScore, action, alertConfig);
        if (!logResult?.logged) {
            throw new Error('Threshold action could not be recorded');
        }

        await markThresholdLogRepaired(client, guildId, userId);
        await postConfiguredThresholdAlert(client, userId, claimedScore, alertConfig);
        logger.info(`Account status threshold log repaired for ${userId} in ${guildId}`);
        return true;
    } catch (err) {
        await markThresholdLogRepairFailed(client, guildId, userId, err);
        logger.error(`Threshold action log repair failed for ${userId} in ${guildId}:`, err);
        return false;
    }
}

async function claimThresholdLogRepair(client, guildId, userId) {
    const dbClient = await client.db.connect();

    try {
        await dbClient.query('BEGIN');

        await dbClient.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`account-status:${guildId}:${userId}`]
        );

        const { rows } = await dbClient.query(
            `UPDATE account_status
             SET threshold_status = 'logging',
                 threshold_claimed_at = NOW(),
                 threshold_error = NULL
             WHERE guild_id = $1
               AND user_id = $2
               AND threshold_claimed_score IS NOT NULL
               AND (
                 threshold_status = 'logging_failed'
                 OR (
                   threshold_status = 'logging'
                   AND threshold_claimed_at < NOW() - ($3::text)::interval
                 )
               )
             RETURNING threshold_claimed_score, threshold_action`,
            [guildId, userId, STALE_THRESHOLD_INTERVAL]
        );

        await dbClient.query('COMMIT');
        return rows[0] ?? null;
    } catch (err) {
        await dbClient.query('ROLLBACK');
        throw err;
    } finally {
        dbClient.release();
    }
}

async function postThresholdAlert(client, channel, userId, score, asConfig) {
    const user = await client.users.fetch(userId).catch(() => null);
    const action = normalizeThresholdAction(asConfig.thresholdAction);
    const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

    const text = [
        `${PUNISH_EMOJI} **|** Account Status Threshold Reached\n`,
        `**User:** <@${userId}> (${userId})`,
        `**Score:** ${score.toFixed(1)} / ${asConfig.threshold}`,
        `**Action Taken:** ${actionLabel}`,
    ].join('\n');

    const section = new SectionBuilder()
        .addTextDisplayComponents(td => td.setContent(text))
        .setThumbnailAccessory(thumbnail =>
            thumbnail.setURL(user?.displayAvatarURL() ?? 'https://cdn.discordapp.com/embed/avatars/0.png')
        );

    const container = new ContainerBuilder()
        .setAccentColor(0xbc2b2a)
        .addSectionComponents(section)
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# **Automated** — <t:${Math.floor(Date.now() / 1000)}:f>`
            )
        );

    await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

export async function getScore(client, guildId, userId) {
    const { rows } = await client.db.query(
        `SELECT score, last_infraction, reset_at, created_at,
                threshold_status, threshold_claimed_at, threshold_processed_at, threshold_error
         FROM account_status
         WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );

    return rows[0] ?? {
        score: 0,
        last_infraction: null,
        reset_at: null,
        created_at: null,
        threshold_status: 'idle',
        threshold_claimed_at: null,
        threshold_processed_at: null,
        threshold_error: null,
    };
}

export async function resetScore(client, guildId, userId) {
    await client.db.query(
        `UPDATE account_status
         SET score = 0,
             reset_at = NOW(),
             threshold_status = 'idle',
             threshold_claimed_at = NULL,
             threshold_processed_at = NULL,
             threshold_error = NULL,
             threshold_claimed_score = NULL,
             threshold_action = NULL
         WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
}

export async function clearScore(client, guildId, userId) {
    const result = await client.db.query(
        `UPDATE account_status
         SET score = 0,
             last_infraction = NULL,
             reset_at = NOW(),
             threshold_status = 'idle',
             threshold_claimed_at = NULL,
             threshold_processed_at = NULL,
             threshold_error = NULL,
             threshold_claimed_score = NULL,
             threshold_action = NULL
         WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
    return result.rowCount > 0;
}

export async function setScore(client, guildId, userId, score) {
    await client.db.query(
        `INSERT INTO account_status (guild_id, user_id, score)
         VALUES ($1, $2, $3)
         ON CONFLICT (guild_id, user_id) DO UPDATE
         SET score = $3,
             threshold_status = 'idle',
             threshold_claimed_at = NULL,
             threshold_processed_at = NULL,
             threshold_error = NULL,
             threshold_claimed_score = NULL,
             threshold_action = NULL`,
        [guildId, userId, score]
    );
}

export function startAccountStatusRefresh(client) {
    setInterval(async () => {
        try {
            await retryDueThresholds(client);
            await retryThresholdLoggingFailures(client);

            for (const [guildId] of client.guilds.cache) {
                const config = await getGuildConfig(guildId, client).catch(() => null);
                const asConfig = config?.accountStatus;

                if (!asConfig?.enabled || !asConfig?.refresh?.enabled || !asConfig?.refresh?.cron) continue;

                const timezone = config?.general?.timezone || 'UTC';
                if (!matchesCron(asConfig.refresh.cron, timezone)) continue;

                await client.db.query(
                    `UPDATE account_status
                     SET score = 0,
                         reset_at = NOW(),
                         threshold_status = 'idle',
                         threshold_claimed_at = NULL,
                         threshold_processed_at = NULL,
                         threshold_error = NULL,
                         threshold_claimed_score = NULL,
                         threshold_action = NULL
                     WHERE guild_id = $1`,
                    [guildId]
                );

                logger.info(`Account status scores refreshed for guild ${guildId}`);
            }
        } catch (err) {
            logger.error('Account status refresh check failed:', err);
        }
    }, 60_000);

    logger.info('Account status refresh scheduler started (60s interval)');
}

function normalizeThresholdAction(action) {
    return action || 'none';
}

function formatThresholdError(err) {
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return JSON.stringify(err);
}
