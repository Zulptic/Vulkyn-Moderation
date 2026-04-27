import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';

const DEFAULT_CONFIG = {
    general: {
        botNickname: null,
        language: 'en',
        timezone: 'UTC',
        deleteConfigOnLeave: false,
        errorLogging: { enabled: false },
    },

    permissions: {
        manageBot: [],
        panelPermissions: [],
        commandRules: [],
    },

    commands: {
        prefixes: ['!'],
        ignoredChannels: [],
        ignoredRoles: [],
        customCommands: [],
        commandSettings: {
            warn: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
            mute: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
            unmute: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
            timeout: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
            untimeout: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
            kick: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
            ban: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
            unban: { enabled: true, slashEnabled: true, prefixEnabled: true, aliases: [], autoDelete: false, reply: true, cooldown: 0 },
        },
        errorMessages: {
            noPermissions: true,
            commandNotFound: false,
            commandUsage: true,
            ignoredChannel: false,
            cooldown: true,
        },
    },

    messages: {
        templates: [],
        timedEvents: [],
        botMessages: {
            punishmentResponses: { warnSuccess: null, muteSuccess: null, timeoutSuccess: null, kickSuccess: null, banSuccess: null, unmuteSuccess: null, unbanSuccess: null, untimeoutSuccess: null },
            punishmentDm: { warnDm: null, muteDm: null, timeoutDm: null, kickDm: null, banDm: null },
            modLog: { punishmentLog: null, reversalLog: null },
            errorMessages: { noPermissions: null, commandNotFound: null, commandUsage: null, ignoredChannel: null, cooldown: null, userNotFound: null, cannotPunishSelf: null, cannotPunishBot: null, higherRole: null, alreadyMuted: null, notMuted: null, notBanned: null, notTimedOut: null, invalidDuration: null, maxDuration: null, invalidPurge: null, muteRoleMissing: null },
            automodMessages: { aiDetection: null, spamDetection: null, mentionSpam: null, linkDetection: null, inviteDetection: null, bannedWord: null, capsDetection: null, lineDetection: null },
            eventMessages: { welcome: null, leave: null, banExpired: null, muteExpired: null },
        },
    },

    logging: {
        enabled: false,
        dmOnWarn: true,
        dmOnMute: true,
        dmOnTimeout: true,
        dmOnKick: true,
        dmOnBan: true,
        showModInDm: false,
        applications: { categoryChannel: null },
        channels: { categoryChannel: null },
        discordAutoMod: { categoryChannel: null },
        emojis: { categoryChannel: null },
        events: { categoryChannel: null },
        invites: { categoryChannel: null },
        messages: { categoryChannel: null },
        polls: { categoryChannel: null },
        roles: { categoryChannel: null },
        stage: { categoryChannel: null },
        stickers: { categoryChannel: null },
        soundboard: { categoryChannel: null },
        threads: { categoryChannel: null },
        users: { categoryChannel: null },
        voice: { categoryChannel: null },
        webhooks: { categoryChannel: null },
        server: { categoryChannel: null },
        moderation: { categoryChannel: null },
    },

    muteRoleId: null,

    emojis: {
        success: '<:success_1:1496689024482414817><:success_2:1496689038726267041><:success_3:1496689049438654524>',
        warning: '<:warning_1:1496696965071900784><:warning_2:1496696992686936075><:warning_3:1496697019178418376>',
        error: '<:error_1:1496696665799917719><:error_2:1496696689032036483><:error_3:1496696754450464920>',
        punishment: '<:punishment_1:1497070437618684065><:punishment_2:1497070473010217061><:punishment_3:1497070518598238330>',
        unpunish: '<:punishment2_1:1497344429407735909><:punishment2_2:1497344449385205851><:punishment2_3:1497344463192854691>',
        command: '<:command_1:1497044370254200902><:command_2:1497044410683359312><:command_3:1497044450185056456>',
    },

    colors: {
        success: '0x47bc29',
        warning: '0xfac775',
        error: '0xbc2b2a',
        punishment: '0xbc2b2a',
        unpunish: '0x2b8a3e',
        info: '0x143bf4',
    },
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