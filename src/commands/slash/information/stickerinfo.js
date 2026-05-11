import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

export default {
    name: 'stickerinfo',
    data: new SlashCommandBuilder()
        .setName('stickerinfo')
        .setDescription('Display information about a sticker by ID')
        .addStringOption(opt => opt.setName('id').setDescription('Sticker ID').setRequired(true)),
    async execute(interaction, client) {
        const id = interaction.options.getString('id');

        if (!/^\d{17,20}$/.test(id)) {
            return embedService.error(interaction, 'Please provide a valid sticker ID.');
        }

        try {
            const sticker = await client.fetchSticker(id);
            return embedService.stickerInfo(interaction, sticker);
        } catch {
            return embedService.error(interaction, 'Could not find a sticker with that ID.');
        }
    },
};
