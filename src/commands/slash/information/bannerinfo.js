import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'bannerinfo',
    data: new SlashCommandBuilder()
        .setName('bannerinfo')
        .setDescription("Display a user's banner")
        .addUserOption(opt => opt.setName('user').setDescription('User to look up (defaults to you)')),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user') ?? interaction.user;
        const fullUser = await client.users.fetch(target.id, { force: true });
        return embedService.bannerInfo(interaction, fullUser);
    },
};
