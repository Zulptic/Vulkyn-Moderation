import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'serverbannerinfo',
    data: new SlashCommandBuilder()
        .setName('serverbannerinfo')
        .setDescription("Display the server's banner"),
    async execute(interaction, client) {
        return embedService.serverBannerInfo(interaction, interaction.guild);
    },
};
