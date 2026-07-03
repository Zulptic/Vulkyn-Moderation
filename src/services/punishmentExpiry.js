import { getGuildConfig } from './guildConfig.js';
import { logModAction } from './moderationService.js';
import { errorService } from './errorService.js';

const SCHEDULER_INTERVAL_MS = 60_000;
const SCHEDULE_WINDOW_MS = 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const STALE_PROCESSING_INTERVAL = '5 minutes';
const DISCORD_UNKNOWN_MEMBER = 10007;
const DISCORD_UNKNOWN_BAN = 10026;

const scheduledExpirations = new Map();

export function startPunishmentExpiryScheduler(client) {
    console.log('[punishmentExpiry] Starting punishment expiry scheduler');

    scheduleUpcomingExpirations(client).catch(err =>
        console.error('[punishmentExpiry] Initial scheduling failed:', err)
    );

    const interval = setInterval(() => {
        scheduleUpcomingExpirations(client).catch(err =>
            console.error('[punishmentExpiry] Scheduler failed:', err)
        );
    }, SCHEDULER_INTERVAL_MS);

    console.log(`[punishmentExpiry] Scheduler started (${SCHEDULER_INTERVAL_MS / 1000}s interval)`);
    return interval;
}

export async function scheduleUpcomingExpirations(client) {
    console.log('[punishmentExpiry] Checking for upcoming punishment expirations');

    const guildIds = [...client.guilds.cache.keys()];
    if (!guildIds.length) {
        console.log('[punishmentExpiry] No cached guilds; skipping expiration scheduling');
        return;
    }

    const { rows } = await client.db.query(
        `SELECT id, guild_id, user_id, type, active, expires_at, expiry_status, expiry_claimed_at, NOW() AS db_now
         FROM infractions
         WHERE active = true
           AND type IN ('mute', 'ban')
           AND guild_id = ANY($1::text[])
           AND expires_at IS NOT NULL
           AND expires_at <= NOW() + INTERVAL '1 hour'
           AND (
             COALESCE(expiry_status, 'active') IN ('active', 'failed')
             OR (
               expiry_status = 'processing'
               AND expiry_claimed_at < NOW() - ($2::text)::interval
             )
           )
         ORDER BY expires_at ASC`,
        [guildIds, STALE_PROCESSING_INTERVAL]
    );

    console.log(`[punishmentExpiry] Found ${rows.length} active punishment expiration(s) due within the next hour`);

    for (const infraction of rows) {
        console.log(
            `[punishmentExpiry] Queue candidate: ${infraction.type} infraction ${infraction.id} ` +
            `for user ${infraction.user_id} in guild ${infraction.guild_id}; ` +
            `expires_at=${infraction.expires_at}; expiry_status=${infraction.expiry_status}; db_now=${infraction.db_now}`
        );

        scheduleInfractionExpiry(client, infraction);
    }
}

export function scheduleInfractionExpiry(client, infraction) {
    if (!infraction?.id || !infraction.expires_at) {
        console.warn('[punishmentExpiry] Cannot schedule: missing infraction id or expires_at');
        return;
    }

    if (scheduledExpirations.has(infraction.id)) {
        console.log(`[punishmentExpiry] Infraction ${infraction.id} is already scheduled; skipping`);
        return;
    }

    const expiresAt = new Date(infraction.expires_at).getTime();
    const delay = expiresAt - Date.now();

    console.log(
        `[punishmentExpiry] Scheduling ${infraction.type} infraction ${infraction.id}; ` +
        `delay=${delay}ms; expires_at=${infraction.expires_at}`
    );

    if (delay <= 0) {
        console.log(`[punishmentExpiry] Infraction ${infraction.id} is overdue; expiring immediately`);

        scheduledExpirations.set(infraction.id, null);

        expireInfraction(client, infraction.id).finally(() => {
            scheduledExpirations.delete(infraction.id);
            console.log(`[punishmentExpiry] Removed immediate expiry ${infraction.id} from scheduled map`);
        });

        return;
    }

    if (delay > SCHEDULE_WINDOW_MS) {
        console.log(`[punishmentExpiry] Infraction ${infraction.id} is outside schedule window; skipping`);
        return;
    }

    if (delay > MAX_TIMEOUT_MS) {
        console.log(`[punishmentExpiry] Infraction ${infraction.id} exceeds max setTimeout delay; skipping`);
        return;
    }

    const timeout = setTimeout(() => {
        console.log(`[punishmentExpiry] Timer fired for infraction ${infraction.id}`);

        expireInfraction(client, infraction.id).finally(() => {
            scheduledExpirations.delete(infraction.id);
            console.log(`[punishmentExpiry] Removed timer expiry ${infraction.id} from scheduled map`);
        });
    }, delay);

    scheduledExpirations.set(infraction.id, timeout);

    console.log(
        `[punishmentExpiry] Infraction ${infraction.id} scheduled successfully; ` +
        `scheduled_count=${scheduledExpirations.size}`
    );
}

export async function expireInfraction(client, infractionId) {
    console.log(`[punishmentExpiry] Attempting to expire infraction ${infractionId}`);

    const infraction = await claimExpiredInfraction(client, infractionId);

    if (!infraction) {
        console.warn(
            `[punishmentExpiry] Infraction ${infractionId} was not claimed. ` +
            `It may already be inactive, not due yet, claimed by another worker, missing expires_at, or not a mute/ban.`
        );
        return;
    }

    console.log(
        `[punishmentExpiry] Claimed ${infraction.type} infraction ${infraction.id} ` +
        `for user ${infraction.user_id} in guild ${infraction.guild_id}`
    );

    const guild = client.guilds.cache.get(infraction.guild_id);

    try {
        if (!guild) {
            throw new Error(`Guild ${infraction.guild_id} is not cached on this worker`);
        }

        if (infraction.type === 'mute') {
            await expireMute(client, guild, infraction);
        } else if (infraction.type === 'ban') {
            await expireBan(client, guild, infraction);
        } else {
            throw new Error(`Unknown infraction type '${infraction.type}'`);
        }

        await markInfractionExpired(client, infraction.id);
    } catch (err) {
        const errorMessage = formatExpiryError(err);
        console.warn(`[punishmentExpiry] Expiry failed for infraction ${infraction.id}: ${errorMessage}`);
        await markInfractionFailed(client, infraction.id, errorMessage);

        if (['No mute role configured', 'Configured mute role is unavailable'].includes(errorMessage)) {
            await errorService.warning(client, {
                guildId: infraction.guild_id,
                code: errorMessage === 'No mute role configured'
                    ? 'MUTE_ROLE_NOT_CONFIGURED'
                    : 'MUTE_ROLE_UNAVAILABLE',
                source: 'punishment-expiry',
                operation: `expire-${infraction.type}`,
                message: errorMessage,
                context: {
                    infractionId: infraction.id,
                    userId: infraction.user_id,
                },
            });
        } else {
            await errorService.error(client, err, {
                guildId: infraction.guild_id,
                source: 'punishment-expiry',
                operation: `expire-${infraction.type}`,
                context: {
                    infractionId: infraction.id,
                    userId: infraction.user_id,
                },
            });
        }
        return;
    }

    await logExpiryModAction(client, infraction).catch(async err => {
        console.warn(`[punishmentExpiry] Failed to log expiry action for infraction ${infraction.id}:`, err);
        await errorService.error(client, err, {
            guildId: infraction.guild_id,
            source: 'punishment-expiry',
            operation: 'log-expiry-action',
            context: {
                infractionId: infraction.id,
                userId: infraction.user_id,
                type: infraction.type,
            },
        });
    });

    console.log(`[punishmentExpiry] ${infraction.type} expiry completed for ${infraction.user_id} in ${guild.name}`);
}

async function claimExpiredInfraction(client, infractionId) {
    console.log(`[punishmentExpiry] Claiming expired infraction ${infractionId}`);

    const { rows } = await client.db.query(
        `UPDATE infractions
         SET expiry_status = 'processing',
             expiry_claimed_at = NOW(),
             expiry_error = NULL
         WHERE id = $1
           AND active = true
           AND type IN ('mute', 'ban')
           AND expires_at IS NOT NULL
           AND expires_at <= NOW()
           AND (
             COALESCE(expiry_status, 'active') = 'active'
             OR (
               expiry_status = 'processing'
               AND expiry_claimed_at < NOW() - ($2::text)::interval
             )
             OR expiry_status = 'failed'
           )
         RETURNING id, guild_id, user_id, type, expires_at, expiry_status, expiry_claimed_at, NOW() AS db_now`,
        [infractionId, STALE_PROCESSING_INTERVAL]
    );

    if (!rows[0]) {
        console.warn(`[punishmentExpiry] Claim returned no rows for infraction ${infractionId}`);
        return null;
    }

    console.log(
        `[punishmentExpiry] Claim succeeded for infraction ${rows[0].id}; ` +
        `expires_at=${rows[0].expires_at}; db_now=${rows[0].db_now}`
    );

    return rows[0];
}

async function markInfractionExpired(client, infractionId) {
    await client.db.query(
        `UPDATE infractions
         SET active = false,
             expiry_status = 'expired',
             expiry_processed_at = NOW(),
             expiry_error = NULL
         WHERE id = $1`,
        [infractionId]
    );

    console.log(`[punishmentExpiry] Marked infraction ${infractionId} as expired`);
}

async function markInfractionFailed(client, infractionId, errorMessage) {
    await client.db.query(
        `UPDATE infractions
         SET expiry_status = 'failed',
             expiry_error = $2
         WHERE id = $1`,
        [infractionId, errorMessage]
    );

    console.log(`[punishmentExpiry] Marked infraction ${infractionId} as failed`);
}

async function expireMute(client, guild, infraction) {
    console.log(`[punishmentExpiry] Processing mute expiry ${infraction.id} for user ${infraction.user_id}`);

    const config = await getGuildConfig(infraction.guild_id, client);
    const muteRoleId = config?.muteRoleId;

    if (!muteRoleId) {
        throw new Error('No mute role configured');
    }
    if (!guild.roles.cache.has(muteRoleId)) {
        throw new Error('Configured mute role is unavailable');
    }

    const member = await guild.members.fetch(infraction.user_id).catch(err => {
        if (hasDiscordErrorCode(err, DISCORD_UNKNOWN_MEMBER)) {
            return null;
        }

        throw new Error(`Failed to fetch member ${infraction.user_id}: ${formatExpiryError(err)}`);
    });

    if (!member) {
        console.warn(`[punishmentExpiry] Member ${infraction.user_id} not found for mute expiry ${infraction.id}`);
    } else if (!member.roles.cache.has(muteRoleId)) {
        console.warn(`[punishmentExpiry] Member ${infraction.user_id} does not have mute role for expiry ${infraction.id}`);
    } else {
        await member.roles.remove(muteRoleId, 'Mute expired');

        console.log(`[punishmentExpiry] Removed mute role from ${infraction.user_id} for infraction ${infraction.id}`);
    }
}

async function expireBan(client, guild, infraction) {
    console.log(`[punishmentExpiry] Processing ban expiry ${infraction.id} for user ${infraction.user_id}`);

    await guild.members.unban(infraction.user_id, 'Ban expired').catch(err => {
        if (hasDiscordErrorCode(err, DISCORD_UNKNOWN_BAN)) {
            console.warn(`[punishmentExpiry] User ${infraction.user_id} is not banned for expiry ${infraction.id}`);
            return;
        }

        throw err;
    });
}

async function logExpiryModAction(client, infraction) {
    await logModAction(client, {
        guildId: infraction.guild_id,
        action: infraction.type === 'mute' ? 'unmute' : 'unban',
        moderatorId: null,
        targetId: infraction.user_id,
        reason: infraction.type === 'mute' ? 'Mute expired' : 'Ban expired',
        metadata: {
            system: true,
            infractionId: infraction.id,
        },
    });
}

function formatExpiryError(err) {
    if (!err) return 'Unknown error';
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return JSON.stringify(err);
}

function hasDiscordErrorCode(err, code) {
    return Number(err?.code) === code;
}
