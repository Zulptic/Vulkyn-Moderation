import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';

const DEFAULT_CONFIG = {
    commandMode: 'both',
    prefix: '!',
    disabledCommands: [],
    permissions: {
        manageBot: [],
        commandRules: [],
    },
    modLog: {
        channel: null,
        dmOnWarn: true,
        dmOnMute: true,
        dmOnKick: true,
        dmOnBan: true,
        dmOnTimeout: true,
        showModInDm: false,
    },
    muteRoleId: null,
};

export default {
    name: 'guildCreate',
    async execute(guild, client) {
        try {
            await client.db.query(
                `INSERT INTO guild_configs (guild_id, guild_name, config)
                 VALUES ($1, $2, $3)
                     ON CONFLICT (guild_id) DO UPDATE SET guild_name = $2, updated_at = NOW()`,
                [guild.id, guild.name, JSON.stringify(DEFAULT_CONFIG)]
            );

            logger.info(`Joined guild: ${guild.name} (${guild.id}) — config created`);

            // Check if guild already has a valid mute role
            const existingConfig = await getGuildConfig(guild.id, client);
            if (!existingConfig?.muteRoleId || !guild.roles.cache.has(existingConfig.muteRoleId)) {

                const muteRole = await guild.roles.create({
                    name: 'Server Mute',
                    color: 0x818386,
                    permissions: [],
                    reason: 'Vulkyn Moderation — Server Mute role',
                });

                logger.info(`Created Server Mute role (${muteRole.id}) in ${guild.name}`);

                const channels = guild.channels.cache.filter(ch => ch.isTextBased() || ch.isVoiceBased());
                for (const [, channel] of channels) {
                    await channel.permissionOverwrites.create(muteRole, {
                        SendMessages: false,
                        AddReactions: false,
                        Speak: false,
                        Connect: false,
                    }).catch(() => {});
                    await new Promise(resolve => setTimeout(resolve, 750));
                }

                logger.info(`Applied mute overrides to ${channels.size} channels in ${guild.name}`);

                const config = { ...existingConfig, muteRoleId: muteRole.id };
                await client.db.query(
                    `UPDATE guild_configs SET config = $1, updated_at = NOW() WHERE guild_id = $2`,
                    [JSON.stringify(config), guild.id]
                );

                await client.redis.del(`guild:config:${guild.id}`);
            }

            await client.syncGuildCommands(guild.id, client);
        } catch (err) {
            logger.error(`Failed to setup guild ${guild.id}:`, err);
        }
    },
};