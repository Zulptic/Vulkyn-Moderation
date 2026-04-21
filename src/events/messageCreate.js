import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';

export default {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        const config = await getGuildConfig(message.guild.id, client);
        const prefix = config?.prefix || '!';

        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        const command = client.prefixCommands.get(commandName);
        if (!command) return;

        try {
            await command.execute(message, args, client);
        } catch (err) {
            logger.error(`Prefix command error [${commandName}]:`, err);
            await message.reply('Something went wrong running that command.').catch(() => {});
        }
    },
};