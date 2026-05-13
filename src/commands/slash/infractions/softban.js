import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { canPunishTarget } from '../../../services/permissionService.js';

export default {
    name: 'softban',
    data: new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Kick a user and delete their last 24 hours of messages without notifying them')
        .addUserOption(opt =>
            opt.setName('user').setDescription('User to softban').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('reason').setDescription('Reason for the softban')
        )
        .addStringOption(opt =>
            opt.setName('proof').setDescription('Evidence for this action (link or text)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const proof = interaction.options.getString('proof') || null;

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot softban yourself.');
        }

        if (target.bot) {
            return embedService.error(interaction, 'You cannot softban a bot.');
        }

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member && !member.bannable) {
            return embedService.error(interaction, 'I cannot softban this user. They may have a higher role than me.');
        }

        const punishErr = canPunishTarget(interaction.member, member);
        if (punishErr) return embedService.error(interaction, punishErr);

        await interaction.deferReply({ flags: 64 });

        const { infraction } = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'softban',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            proof,
        });

        await interaction.guild.members.ban(target.id, { reason, deleteMessageSeconds: 86400 });
        await interaction.guild.members.unban(target.id, 'softban — message purge complete');

        return embedService.modActionSuccess(interaction, {
            action: 'softban',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: interaction.guild.id,
            reason,
            proof,
        });
    },
};
