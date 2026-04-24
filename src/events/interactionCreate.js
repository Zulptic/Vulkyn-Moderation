import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { canUseCommand } from '../services/permissionService.js';
import {embedService} from "../services/embedService.js";

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isChatInputCommand()) return;

        const config = await getGuildConfig(interaction.guild.id, client);

        if (config?.commandMode === 'prefix') {
            return embedService.error(interaction, 'Slash commands are disabled in this Discord.')
        }

        const command = client.slashCommands.get(interaction.commandName);
        if (!command) return;

        if (!await canUseCommand(interaction.member, command.name, client)) {
            return embedService.error(interaction, 'You do not have permissions to use this command!')
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