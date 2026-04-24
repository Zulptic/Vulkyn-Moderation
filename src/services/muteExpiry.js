import { logger } from '../utils/logger.js';
import { getGuildConfig } from './guildConfig.js';

const CHECK_INTERVAL = 30000; // 30 seconds

export function startMuteExpiry(client) {
    setInterval(async () => {
        try {
            const { rows } = await client.db.query(
                `SELECT id, guild_id, user_id FROM infractions
                 WHERE type = 'mute' AND active = true AND expires_at IS NOT NULL AND expires_at <= NOW()`
            );

            for (const row of rows) {
                const guild = client.guilds.cache.get(row.guild_id);
                if (!guild) continue;

                const config = await getGuildConfig(row.guild_id, client);
                const muteRoleId = config?.muteRoleId;
                if (!muteRoleId) continue;

                const member = await guild.members.fetch(row.user_id).catch(() => null);
                if (member && member.roles.cache.has(muteRoleId)) {
                    await member.roles.remove(muteRoleId, 'Mute expired').catch(() => {});
                    logger.info(`Mute expired for ${row.user_id} in ${guild.name}`);
                }

                await client.db.query(
                    `UPDATE infractions SET active = false WHERE id = $1`,
                    [row.id]
                );
            }
        } catch (err) {
            logger.error('Mute expiry check failed:', err);
        }
    }, CHECK_INTERVAL);

    logger.info('Mute expiry checker started (30s interval)');
}