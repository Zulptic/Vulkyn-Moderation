import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'servericoninfo',
    data: new SlashCommandBuilder()
        .setName('servericoninfo')
        .setDescription("Display the server's icon"),
    async execute(interaction, client) {
        return embedService.serverIconInfo(interaction, interaction.guild);
    },
};
