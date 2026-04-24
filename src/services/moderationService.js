import { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, SectionBuilder, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';

const DM_KEYS = {
    warn: 'dmOnWarn',
    mute: 'dmOnMute',
    timeout: 'dmOnTimeout',
    kick: 'dmOnKick',
    ban: 'dmOnBan',
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

        const config = await getGuildConfig(guildId, client);

        const preposition = infraction.type === 'kick' ? 'from' : 'in';

        let detailsText = `**Reason:** ${infraction.reason}`;

        if (infraction.duration && ['mute', 'timeout', 'ban'].includes(infraction.type)) {
            detailsText += `\n**Duration:** ${formatDuration(infraction.duration)}`;
        }

        detailsText += `\n**Case:** #${infraction.case_number}`;

        let footerText;
        if (config?.modLog?.showModInDm && infraction.moderator_id) {
            const moderator = (await client.users.fetch(infraction.moderator_id).catch(() => null))?.username ?? 'Unknown';
            footerText = `-# **@${moderator}** — <t:${Math.floor(Date.now() / 1000)}:f>`;
        } else {
            footerText = `-# <t:${Math.floor(Date.now() / 1000)}:f>`;
        }

        const container = new ContainerBuilder()
            .setAccentColor(0xbc2b2a)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`<:punishment_1:1497070437618684065><:punishment_2:1497070473010217061><:punishment_3:1497070518598238330> **|** You have been ${formatAction(infraction.type)} ${preposition} **${guild.name}**`)
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

        const typeLabel = capitalize(infraction.type);
        const punishedUser = await client.users.fetch(infraction.user_id).catch(() => null);

        let detailsText = `<:punishment_1:1497070437618684065><:punishment_2:1497070473010217061><:punishment_3:1497070518598238330> **|** ${typeLabel} #${infraction.case_number}\n\n**User:** <@${infraction.user_id}> (${infraction.user_id})\n**Reason:** ${infraction.reason}`;

        if (infraction.duration && ['mute', 'timeout', 'ban'].includes(infraction.type)) {
            detailsText += `\n**Duration:** ${formatDuration(infraction.duration)}`;
        }

        const moderator = infraction.moderator_id
            ? (await client.users.fetch(infraction.moderator_id).catch(() => null))?.username ?? 'Unknown'
            : 'Automated';

        const section = new SectionBuilder()
            .addTextDisplayComponents(
                textDisplay => textDisplay.setContent(detailsText)
            )
            .setThumbnailAccessory(
                thumbnail => thumbnail.setURL(punishedUser?.displayAvatarURL() ?? 'https://cdn.discordapp.com/embed/avatars/0.png')
            );

        const container = new ContainerBuilder()
            .setAccentColor(0xbc2b2a)
            .addSectionComponents(section)
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`-# **@${moderator}** — <t:${Math.floor(Date.now() / 1000)}:f>`)
            );

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
        timeout: 'timed out',
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