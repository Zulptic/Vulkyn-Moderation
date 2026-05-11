import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

function extractIds(str) {
    return [...str.matchAll(/\d{17,20}/g)].map(m => m[0]);
}

export default {
    name: 'multiwarn',
    data: new SlashCommandBuilder()
        .setName('multiwarn')
        .setDescription('Warn multiple users at once')
        .addStringOption(opt =>
            opt.setName('users').setDescription('Comma-separated IDs or @mentions').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('reason').setDescription('Reason for the warnings')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction, client) {
        const ids = extractIds(interaction.options.getString('users'));
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (!ids.length) return embedService.error(interaction, 'Please provide at least one valid user ID or mention.');

        await interaction.deferReply({ flags: 64 });

        const actioned = [];
        const failed = [];

        for (const id of ids) {
            const user = await client.users.fetch(id).catch(() => null);
            if (!user) { failed.push({ id, reason: 'User not found' }); continue; }
            if (user.bot) { failed.push({ id, reason: 'Cannot warn a bot' }); continue; }
            if (user.id === interaction.user.id) { failed.push({ id, reason: 'Cannot warn yourself' }); continue; }

            const { infraction } = await logModAction(client, {
                guildId: interaction.guild.id,
                action: 'warn',
                moderatorId: interaction.user.id,
                targetId: user.id,
                reason,
            });

            actioned.push({ userId: user.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(interaction, `No users were warned.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(interaction, {
            action: 'warn',
            actioned,
            failed,
            guildId: interaction.guild.id,
            reason,
        });
    },
};
