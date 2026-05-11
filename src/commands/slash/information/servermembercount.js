import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'servermembercount',
    data: new SlashCommandBuilder()
        .setName('servermembercount')
        .setDescription('Display the member count for this server'),
    async execute(interaction, client) {
        return embedService.serverMemberCount(interaction, interaction.guild);
    },
};
