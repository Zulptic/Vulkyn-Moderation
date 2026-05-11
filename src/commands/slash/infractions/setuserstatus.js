import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { setScore } from '../../../services/accountStatusService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

export default {
    name: 'setuserstatus',
    data: new SlashCommandBuilder()
        .setName('setuserstatus')
        .setDescription("Set a user's account status score")
        .addUserOption(opt =>
            opt.setName('user').setDescription('User to set').setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('score').setDescription('Score to set').setRequired(true).setMinValue(0)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user');
        const score = interaction.options.getInteger('score');
        const config = await getGuildConfig(interaction.guild.id, client);
        const asConfig = config?.accountStatus ?? {};

        if (!asConfig.enabled) {
            return embedService.error(interaction, 'Account Status is disabled in the config!');
        }

        await interaction.deferReply({ flags: 64 });

        await setScore(client, interaction.guild.id, target.id, score);

        return embedService.success(interaction, `Set account status score for <@${target.id}> to **${score}**.`);
    },
};