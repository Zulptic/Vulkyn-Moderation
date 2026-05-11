import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { getScore } from '../../../services/accountStatusService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

export default {
    name: 'userstatus',
    data: new SlashCommandBuilder()
        .setName('userstatus')
        .setDescription("View a user's account status and infraction score")
        .addUserOption(opt =>
            opt.setName('user').setDescription('User to look up (defaults to yourself)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user') ?? interaction.user;
        const config = await getGuildConfig(interaction.guild.id, client);
        const asConfig = config?.accountStatus ?? {};

        if (!asConfig.enabled) {
            return embedService.error(interaction, 'Account Status is disabled in the config!');
        }

        const statusData = await getScore(client, interaction.guild.id, target.id);

        await interaction.deferReply({ flags: 64 });

        return embedService.accountStatusInfo(interaction, {
            user: target,
            statusData,
            asConfig,
        });
    },
};
