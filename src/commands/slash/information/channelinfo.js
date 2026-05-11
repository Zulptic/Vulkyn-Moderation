import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'channelinfo',
    data: new SlashCommandBuilder()
        .setName('channelinfo')
        .setDescription('Display information about a channel')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to look up (defaults to current channel)')),
    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;
        return embedService.channelInfo(interaction, channel);
    },
};
