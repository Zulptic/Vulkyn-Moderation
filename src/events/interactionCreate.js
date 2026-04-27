import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { canUseCommand } from '../services/permissionService.js';
import { embedService } from '../services/embedService.js';

const cooldowns = new Map();

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isChatInputCommand()) return;

        const config = await getGuildConfig(interaction.guild.id, client);
        const cmdConfig = config?.commands || {};

        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;

        // Check if command is enabled
        const settings = cmdConfig.commandSettings?.[command.name];
        if (settings && !settings.enabled) {
            return embedService.error(interaction, 'This command is currently disabled.');
        }
        if (settings && !settings.slashEnabled) {
            return embedService.error(interaction, 'Slash commands are disabled for this command. Use prefix commands instead.');
        }

        // Check permissions
        if (!await canUseCommand(interaction.member, command.name, client)) {
            if (cmdConfig.errorMessages?.noPermissions !== false) {
                return embedService.error(interaction, 'You do not have permissions to use this command.');
            }
            return;
        }

        // Check cooldown
        if (settings?.cooldown > 0) {
            const cooldownKey = `${interaction.guild.id}:${interaction.user.id}:${command.name}`;
            const now = Date.now();
            const expiry = cooldowns.get(cooldownKey);

            if (expiry && now < expiry) {
                const remaining = Math.ceil((expiry - now) / 1000);
                return embedService.error(interaction, `This command is on cooldown. Try again in ${remaining}s.`);
            }

            cooldowns.set(cooldownKey, now + (settings.cooldown * 1000));
            setTimeout(() => cooldowns.delete(cooldownKey), settings.cooldown * 1000);
        }

        try {
            await command.execute(interaction, client);
        } catch (err) {
            logger.error(`Slash command error [${interaction.commandName}]:`, err);

            const reply = { content: 'Something went wrong running that command.', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    },
};