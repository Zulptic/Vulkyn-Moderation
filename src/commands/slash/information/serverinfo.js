import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'serverinfo',
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Display information about this server'),
    async execute(interaction, client) {
        return embedService.guildInfo(interaction, interaction.guild);
    },
};
