import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { canUseCommand } from '../services/permissionService.js';
import { embedService } from '../services/embedService.js';

const cooldowns = new Map();
const LOADING_EMOJI = '<a:loading:1498963770175783032>'; // replace with your loading emoji ID

export default {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        const config = await getGuildConfig(message.guild.id, client);
        const cmdConfig = config?.commands || {};

        // Check ignored channels
        if (cmdConfig.ignoredChannels?.includes(message.channel.id)) {
            return;
        }

        // Check ignored roles
        if (cmdConfig.ignoredRoles?.length > 0) {
            if (message.member.roles.cache.some(role => cmdConfig.ignoredRoles.includes(role.id))) {
                if (cmdConfig.errorMessages?.noPermissions) {
                    return embedService.error(message, 'You do not have permissions to use commands.');
                }
                return;
            }
        }

        // Check prefixes (support multiple)
        const prefixes = cmdConfig.prefixes || ['!'];
        const matchedPrefix = prefixes.find(p => message.content.startsWith(p));
        if (!matchedPrefix) return;

        const args = message.content.slice(matchedPrefix.length).trim().split(/\s+/);
        const commandInput = args.shift().toLowerCase();

        // Find command by name or alias
        let command = client.prefixCommands.get(commandInput);
        if (!command) {
            for (const [, cmd] of client.prefixCommands) {
                const settings = cmdConfig.commandSettings?.[cmd.name];
                if (settings?.aliases?.includes(commandInput)) {
                    command = cmd;
                    break;
                }
            }
        }

        if (!command) {
            if (cmdConfig.errorMessages?.commandNotFound) {
                return embedService.error(message, 'Command not found.');
            }
            return;
        }

        // Check if command is enabled
        const settings = cmdConfig.commandSettings?.[command.name];
        if (settings && !settings.enabled) return;
        if (settings && !settings.prefixEnabled) return;

        // Check permissions
        if (!await canUseCommand(message.member, command.name, client)) {
            if (cmdConfig.errorMessages?.noPermissions) {
                return embedService.error(message, 'You do not have permissions to use this command.');
            }
            return;
        }

        // Check cooldown
        if (settings?.cooldown > 0) {
            const cooldownKey = `${message.guild.id}:${message.author.id}:${command.name}`;
            const now = Date.now();
            const expiry = cooldowns.get(cooldownKey);

            if (expiry && now < expiry) {
                if (cmdConfig.errorMessages?.cooldown) {
                    const remaining = Math.ceil((expiry - now) / 1000);
                    return embedService.error(message, `This command is on cooldown. Try again in ${remaining}s.`);
                }
                return;
            }

            cooldowns.set(cooldownKey, now + (settings.cooldown * 1000));
            setTimeout(() => cooldowns.delete(cooldownKey), settings.cooldown * 1000);
        }

        // Add loading reaction
        let loadingReaction = null;
        try {
            loadingReaction = await message.react(LOADING_EMOJI);
        } catch {
            // Bot lacks Add Reactions permission, skip silently
        }

        try {
            await command.execute(message, args, client);

            // Auto-delete command message
            if (settings?.autoDelete) {
                await message.delete().catch(() => {});
            }
        } catch (err) {
            logger.error(`Prefix command error [${command.name}]:`, err);
            await message.reply('Something went wrong running that command.').catch(() => {});
        } finally {
            // Remove loading reaction (only the bot's own)
            if (loadingReaction && !message.deleted) {
                await loadingReaction.users.remove(client.user.id).catch(() => {});
            }
        }
    },
};