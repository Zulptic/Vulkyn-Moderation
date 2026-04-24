import { logger } from '../utils/logger.js';
import { logModAction } from './moderationService.js';

const CHECK_INTERVAL = 30000;

export function startBanExpiry(client) {
    setInterval(async () => {
        try {
            const { rows } = await client.db.query(
                `SELECT id, guild_id, user_id FROM infractions
                 WHERE type = 'ban' AND active = true AND expires_at IS NOT NULL AND expires_at <= NOW()`
            );

            for (const row of rows) {
                const guild = client.guilds.cache.get(row.guild_id);
                if (!guild) continue;

                await guild.members.unban(row.user_id, 'Ban Expired').catch(() => {});

                await client.db.query(
                    `UPDATE infractions SET active = false WHERE id = $1`,
                    [row.id]
                );

                await logModAction(client, {
                    guildId: row.guild_id,
                    action: 'unban',
                    moderatorId: null, // system
                    targetId: row.user_id,
                    reason: 'Ban expired',
                    metadata: {
                        system: true,
                        infractionId: row.id,
                    },
                });

                logger.info(`Ban expired for ${row.user_id} in ${guild.name}`);
            }
        } catch (error) {
            logger.error('Ban expiry check failed', error);
        }
    }, CHECK_INTERVAL);

    logger.info('Ban expiry checker started (30s interval)');
}