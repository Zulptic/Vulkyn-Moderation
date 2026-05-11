import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';
import { getGuildConfig } from '../../../services/guildConfig.js';

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str?.match(DURATION_REGEX);
    if (!match) return null;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    return parseInt(match[1]) * multipliers[match[2]];
}

function extractIds(str) {
    return [...str.matchAll(/\d{17,20}/g)].map(m => m[0]);
}

export default {
    name: 'multimute',
    data: new SlashCommandBuilder()
        .setName('multimute')
        .setDescription('Mute multiple users at once')
        .addStringOption(opt =>
            opt.setName('users').setDescription('Comma-separated IDs or @mentions').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('duration').setDescription('Duration (e.g. 1h, 7d) — omit for permanent')
        )
        .addStringOption(opt =>
            opt.setName('reason').setDescription('Reason for the mutes')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction, client) {
        const ids = extractIds(interaction.options.getString('users'));
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';

        if (!ids.length) return embedService.error(interaction, 'Please provide at least one valid user ID or mention.');

        const config = await getGuildConfig(interaction.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) return embedService.error(interaction, 'Server Mute role is not configured.');

        const muteRole = interaction.guild.roles.cache.get(muteRoleId);
        if (!muteRole) return embedService.error(interaction, 'Server Mute role was deleted.');

        const duration = durationStr ? parseDuration(durationStr) : null;
        if (durationStr && !duration) return embedService.error(interaction, 'Invalid duration format (e.g. `1h`, `7d`).');

        await interaction.deferReply({ flags: 64 });

        const actioned = [];
        const failed = [];

        for (const id of ids) {
            if (id === interaction.user.id) { failed.push({ id, reason: 'Cannot mute yourself' }); continue; }

            const member = await interaction.guild.members.fetch(id).catch(() => null);
            if (!member) { failed.push({ id, reason: 'Not found in server' }); continue; }
            if (member.user.bot) { failed.push({ id, reason: 'Cannot mute a bot' }); continue; }
            if (member.roles.cache.has(muteRoleId)) { failed.push({ id, reason: 'Already muted' }); continue; }

            await member.roles.add(muteRole, reason);

            const { infraction } = await logModAction(client, {
                guildId: interaction.guild.id,
                action: 'mute',
                moderatorId: interaction.user.id,
                targetId: member.id,
                reason,
                duration,
            });

            actioned.push({ userId: member.id, caseNumber: infraction.case_number });
        }

        if (!actioned.length) {
            return embedService.error(interaction, `No users were muted.\n${failed.map(f => `\`${f.id}\` — ${f.reason}`).join('\n')}`);
        }

        return embedService.multiModActionSuccess(interaction, {
            action: 'mute',
            actioned,
            failed,
            guildId: interaction.guild.id,
            reason,
            duration: durationStr ?? 'Permanent',
        });
    },
};
