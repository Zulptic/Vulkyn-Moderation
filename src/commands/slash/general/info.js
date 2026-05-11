import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'info',
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Display information about Vulkyn'),
    async execute(interaction, client) {
        return embedService.botInfo(interaction, client);
    },
};
