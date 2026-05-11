import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

function extractIds(str) {
    return [...str.matchAll(/\d{17,20}/g)].map(m => m[0]);
}

export default {
    name: 'multikick',
    data: new SlashCommandBuilder()
        .setName('multikick')
        .setDescription('Kick multiple users at once')
        .addStringOption(opt =>
            opt.setName('users').setDescription('Comma-separated IDs or @mentions').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('reason').setDescription('Reason for the kicks')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    async execute(interaction, client) {
        const ids = extractIds(interaction.options.getString('users'));
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (!ids.length) return embedService.error(interaction, 'Please provide at least one valid user ID or mention.');

        await interaction.deferReply({ flags: 64 });

        const actioned = [];
        const failed = [];

        for (const id of ids) {
            if (id === interaction.user.id) { failed.push({ id, reason: 'Cannot kick yourself' }); continue; }

            const member = await interaction.guild.members.fetch(id).catch(() => null);
            if (!member) { failed.push({ id, reason: 'Not found in server' }); continue; }
            if (member.user.bot) { failed.push({ id, reason: 'Cannot kick a bot' }); continue; }
            if (!member.kickable) { failed.push({ id, reason: 'Missing permissions' }); continue; }

            const { infraction } = await logModAction(client, {
                guildId: interaction.guild.id,
                action: 'kick',
                moderatorId: interaction.user.id,
                targetId: member.id,
                reason,
            });

            await member.kick(reason);
            actioned.push({ userId: member.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(interaction, `No users were kicked.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(interaction, {
            action: 'kick',
            actioned,
            failed,
            guildId: interaction.guild.id,
            reason,
        });
    },
};
