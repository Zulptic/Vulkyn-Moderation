import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'serverchannelinfo',
    data: new SlashCommandBuilder()
        .setName('serverchannelinfo')
        .setDescription('Display a breakdown of all channels in this server'),
    async execute(interaction, client) {
        return embedService.serverChannelInfo(interaction, interaction.guild);
    },
};
