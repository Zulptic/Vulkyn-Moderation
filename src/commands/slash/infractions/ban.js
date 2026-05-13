import { SlashCommandBuilder } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { canPunishTarget } from "../../../services/permissionService.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str.match(DURATION_REGEX);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    return num * multipliers[unit];
}

function parsePurgeDuration(str) {
    const parsed = parseDuration(str);
    if (parsed === null || parsed > 604800) return null;
    return parsed;
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
}

export default {
    name: 'ban',
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the ban'))
        .addStringOption(opt => opt.setName('duration').setDescription('Ban duration (e.g. 1h, 7d, 1w) — permanent if not set'))
        .addStringOption(opt => opt.setName('purge').setDescription('Delete message history (e.g. 30m, 6h, 3d, 1w)'))
        .addStringOption(opt => opt.setName('proof').setDescription('Evidence for this action (link or text)')),
    async execute(interaction, client) {
        const target = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const durationStr = interaction.options.getString('duration');
        const purgeStr = interaction.options.getString('purge');
        const proof = interaction.options.getString('proof') || null;

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot ban yourself.');
        }

        if (target.bot) {
            return embedService.error(interaction, 'You cannot ban a bot.');
        }

        const member = await interaction.guild.members.fetch(target.id).catch(() => null);
        if (member && !member.bannable) {
            return embedService.error(interaction, 'I cannot ban this user. They may have a higher role than me.');
        }

        const punishErr = canPunishTarget(interaction.member, member);
        if (punishErr) return embedService.error(interaction, punishErr);

        let duration = null;
        if (durationStr) {
            duration = parseDuration(durationStr);
            if (duration === null) {
                return embedService.error(interaction, 'Invalid duration (e.g. `1h`, `7d`, `1w`).');
            }
        }

        let deleteMessageSeconds = 0;
        if (purgeStr) {
            const parsed = parsePurgeDuration(purgeStr);
            if (parsed === null) {
                return embedService.error(interaction, 'Invalid purge duration. Max is 7 days (e.g. `30m`, `6h`, `3d`, `1w`).');
            }
            deleteMessageSeconds = parsed;
        }

        await interaction.deferReply({ flags: 64 });

        const { infraction } = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'ban',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            duration,
            proof,
            metadata: {
                deleteMessageSeconds,
            },
        });

        await interaction.guild.members.ban(target.id, {
            reason,
            deleteMessageSeconds,
        });

        return embedService.modActionSuccess(interaction, {
            action: 'ban',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: interaction.guild.id,
            reason,
            duration: duration ? formatDuration(duration) : 'Permanent',
            purged: deleteMessageSeconds > 0 ? `${formatDuration(deleteMessageSeconds)} of messages` : null,
            proof,
        });
    }
}