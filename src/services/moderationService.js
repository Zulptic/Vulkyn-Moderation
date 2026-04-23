import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';

const DM_KEYS = {
    warn: 'dmOnWarn',
    mute: 'dmOnMute',
    kick: 'dmOnKick',
    ban: 'dmOnBan',
};

const ACTION_COLORS = {
    warn: 0xfac775,
    mute: 0xef9f27,
    kick: 0xf09595,
    ban: 0xe24b4a,
};

/*
 * Get the next case number for a guild
 */
async function getNextCaseNumber(guildId, db) {
    const { rows } = await db.query(
        'SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM infractions WHERE guild_id = $1',
        [guildId]
    );
    return rows[0].next;
}

/*
 * Create an infraction and handle the full punishment flow:
 * 1. Log infraction to database
 * 2. DM the user (if configured)
 * 3. Post to mod log channel (Components V2)
 *
 * Returns the created infraction object
 */
export async function createInfraction(client, {
    guildId,
    userId,
    moderatorId = null,
    type,
    reason = 'No reason provided',
    duration = null,
    source = 'manual',
    aiResult = null,
}) {
    const config = await getGuildConfig(guildId, client);

    // Calculate expiry for timed punishments
    let expiresAt = null;
    if (duration) {
        expiresAt = new Date(Date.now() + duration * 1000).toISOString();
    }

    // Get next case number
    const caseNumber = await getNextCaseNumber(guildId, client.db);

    // Insert infraction
    const { rows } = await client.db.query(
        `INSERT INTO infractions (guild_id, case_number, user_id, moderator_id, type, reason, duration, expires_at, source, ai_result)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
        [guildId, caseNumber, userId, moderatorId, type, reason, duration, expiresAt, source, aiResult ? JSON.stringify(aiResult) : null]
    );

    const infraction = rows[0];

    // DM the user if configured
    const dmKey = DM_KEYS[type];
    if (dmKey && config?.modLog?.[dmKey]) {
        await dmUser(client, guildId, userId, infraction);
    }

    // Post to mod log channel
    if (config?.modLog?.channel) {
        await postModLog(client, guildId, infraction);
    }

    return infraction;
}

/*
 * DM the user about their punishment using Components V2
 */
async function dmUser(client, guildId, userId, infraction) {
    try {
        const guild = client.guilds.cache.get(guildId);
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user || !guild) return;

        const container = new ContainerBuilder()
            .setAccentColor(ACTION_COLORS[infraction.type] || 0x888780)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## You have been ${formatAction(infraction.type)} in ${guild.name}`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Reason:** ${infraction.reason}`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Case:** #${infraction.case_number}`)
            );

        if (infraction.duration) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Duration:** ${formatDuration(infraction.duration)}`)
            );
        }

        await user.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
    } catch (err) {
        logger.warn(`Could not DM user ${userId}:`, err);
    }
}

/*
 * Post infraction to the guild's mod log channel using Components V2
 */
async function postModLog(client, guildId, infraction) {
    try {
        const config = await getGuildConfig(guildId, client);
        const channel = client.channels.cache.get(config.modLog.channel);
        if (!channel) return;

        const moderator = infraction.moderator_id
            ? `<@${infraction.moderator_id}>`
            : 'Automated';

        const container = new ContainerBuilder()
            .setAccentColor(ACTION_COLORS[infraction.type] || 0x888780)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## Case #${infraction.case_number} — ${capitalize(infraction.type)}`)
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**User:** <@${infraction.user_id}>`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Moderator:** ${moderator}`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Reason:** ${infraction.reason}`)
            );

        if (infraction.duration) {
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Duration:** ${formatDuration(infraction.duration)}`)
            );
        }

        if (infraction.source !== 'manual') {
            container.addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            );
            container.addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# Source: ${infraction.source}`)
            );
        }

        await channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    } catch (err) {
        logger.warn(`Could not post to mod log in guild ${guildId}:`, err);
    }
}

/*
 * Helpers
 */
function formatAction(type) {
    const actions = {
        warn: 'warned',
        mute: 'muted',
        kick: 'kicked',
        ban: 'banned',
    };
    return actions[type] || type;
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}