import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'ping',
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency and uptime'),
    async execute(interaction, client) {
        return embedService.ping(interaction, client);
    },
};
