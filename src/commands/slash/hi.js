import { SlashCommandBuilder } from 'discord.js';

export default {
    name: 'hi',
    data: new SlashCommandBuilder()
        .setName('hi')
        .setDescription('Say hi to Vulkyn'),
    async execute(interaction) {
        await interaction.reply('Hi!');
    },
};