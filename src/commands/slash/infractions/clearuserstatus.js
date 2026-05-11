import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { clearScore } from '../../../services/accountStatusService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

export default {
    name: 'clearuserstatus',
    data: new SlashCommandBuilder()
        .setName('clearuserstatus')
        .setDescription("Clear a user's account status score")
        .addUserOption(opt =>
            opt.setName('user').setDescription('User to clear').setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user');
        const config = await getGuildConfig(interaction.guild.id, client);
        const asConfig = config?.accountStatus ?? {};

        if (!asConfig.enabled) {
            return embedService.error(interaction, 'Account Status is disabled in the config!');
        }

        await interaction.deferReply({ flags: 64 });

        const cleared = await clearScore(client, interaction.guild.id, target.id);

        if (!cleared) {
            return embedService.error(interaction, 'That user has no Account Status.');
        }

        return embedService.success(interaction, `Cleared account status for <@${target.id}>.`);
    },
};
