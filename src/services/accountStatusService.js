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

        const newScore = rows[0]?.score ?? 0;

        if (newScore >= threshold) {
            await triggerThreshold(client, guildId, userId, newScore, asConfig);
            await client.db.query(
                `UPDATE account_status SET score = 0, reset_at = NOW()
                 WHERE guild_id = $1 AND user_id = $2`,
                [guildId, userId]
            );
        }
    } catch (err) {
        logger.error(`Account status update failed for ${userId} in ${guildId}:`, err);
    }
}

async function triggerThreshold(client, guildId, userId, score, asConfig) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const action = asConfig.thresholdAction;
    const reason = `Account status threshold reached (${score.toFixed(1)}/${asConfig.threshold})`;

    if (asConfig.notifyChannelId) {
        const channel = client.channels.cache.get(asConfig.notifyChannelId);
        if (channel) {
            await postThresholdAlert(client, channel, userId, score, asConfig).catch(() => {});
        }
    }

    if (!action || action === 'none') return;

    try {
        const member = await guild.members.fetch(userId).catch(() => null);

        if (action === 'ban') {
            await guild.members.ban(userId, { reason }).catch(() => {});
        } else if (action === 'kick') {
            if (member) await member.kick(reason).catch(() => {});
        } else if (action === 'mute') {
            const config = await getGuildConfig(guildId, client);
            const muteRoleId = config?.muteRoleId;
            if (muteRoleId && member) {
                await member.roles.add(muteRoleId, reason).catch(() => {});
            }
        }
        // 'warn' has no Discord action — it's log-only

        // Dynamic import breaks the circular dependency with moderationService
        const { logModAction } = await import('./moderationService.js');
        await logModAction(client, {
            guildId,
            action,
            moderatorId: null,
            targetId: userId,
            reason,
            metadata: { system: true, accountStatus: true },
        }, { skipAccountStatus: true });

        logger.info(`Account status threshold '${action}' triggered for ${userId} in ${guildId}`);
    } catch (err) {
        logger.error(`Threshold action failed for ${userId} in ${guildId}:`, err);
    }
}

async function postThresholdAlert(client, channel, userId, score, asConfig) {
    const user = await client.users.fetch(userId).catch(() => null);
    const action = asConfig.thresholdAction ?? 'none';
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
        `SELECT score, last_infraction, reset_at, created_at
         FROM account_status
         WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
    return rows[0] ?? { score: 0, last_infraction: null, reset_at: null, created_at: null };
}

export async function resetScore(client, guildId, userId) {
    await client.db.query(
        `UPDATE account_status SET score = 0, reset_at = NOW()
         WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
}

export async function clearScore(client, guildId, userId) {
    const result = await client.db.query(
        `UPDATE account_status SET score = 0, last_infraction = NULL, reset_at = NOW()
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
         SET score = $3`,
        [guildId, userId, score]
    );
}

export function startAccountStatusRefresh(client) {
    setInterval(async () => {
        try {
            for (const [guildId] of client.guilds.cache) {
                const config = await getGuildConfig(guildId, client).catch(() => null);
                const asConfig = config?.accountStatus;

                if (!asConfig?.enabled || !asConfig?.refresh?.enabled || !asConfig?.refresh?.cron) continue;

                const timezone = config?.general?.timezone || 'UTC';
                if (!matchesCron(asConfig.refresh.cron, timezone)) continue;

                await client.db.query(
                    `UPDATE account_status
                     SET score = 0, reset_at = NOW()
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