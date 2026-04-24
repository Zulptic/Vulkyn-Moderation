import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { canUseCommand } from '../services/permissionService.js';
import {embedService} from "../services/embedService.js";

export default {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        const config = await getGuildConfig(message.guild.id, client);

        if (config?.commandMode === 'slash') return;

        const prefix = config?.prefix || '!';

        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        const command = client.prefixCommands.get(commandName);
        if (!command) return;

        if (!await canUseCommand(message.member, command.name, client)) {
            return embedService.error(message, 'You do not have permissions to use this command!')
        }

        try {
            await command.execute(message, args, client);
        } catch (err) {
            logger.error(`Prefix command error [${commandName}]:`, err);
            await message.reply('Something went wrong running that command.').catch(() => {});
        }
    },
};