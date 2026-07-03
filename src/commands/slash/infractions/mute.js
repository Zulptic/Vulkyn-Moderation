import { SlashCommandBuilder } from "discord.js";
import { logModAction } from "../../../services/moderationService.js";
import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";
import { canPunishTarget } from "../../../services/permissionService.js";
import { scheduleInfractionExpiry } from "../../../services/punishmentExpiry.js";
import { errorService } from "../../../services/errorService.js";

const DURATION_REGEX = /^(\d+)(s|m|h|d|w)$/;

function parseDuration(str) {
    const match = str.match(DURATION_REGEX);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    return num * multipliers[unit];
}

export default {
    name: 'mute',
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute a user (Server Mute role)')
        .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 5m, 1h, 7d) — permanent if not set'))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for the mute'))
        .addStringOption(opt => opt.setName('proof').setDescription('Evidence for this action (link or text)')),
    async execute(interaction, client) {
        const target = interaction.options.getMember('user');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided.';
        const proof = interaction.options.getString('proof') || null;

        const config = await getGuildConfig(interaction.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            await errorService.commandWarning(client, interaction, {
                code: 'MUTE_ROLE_NOT_CONFIGURED',
                operation: 'mute',
                message: 'Server Mute role is not configured.',
            });
            return embedService.error(interaction, 'Server Mute role is not configured. Please re-invite the bot or set it up in the web panel.');
        }

        const muteRole = interaction.guild.roles.cache.get(muteRoleId);
        if (!muteRole) {
            await errorService.commandWarning(client, interaction, {
                code: 'MUTE_ROLE_UNAVAILABLE',
                operation: 'mute',
                message: `Configured Server Mute role ${muteRoleId} is unavailable.`,
                context: { muteRoleId },
            });
            return embedService.error(interaction, 'Server Mute role was deleted. Please re-invite the bot or set it up in the web panel.');
        }

        if (!target) {
            return embedService.error(interaction, 'User not found in this server.');
        }

        if (target.id === interaction.user.id) {
            return embedService.error(interaction, 'You cannot mute yourself.');
        }

        if (target.user.bot) {
            return embedService.error(interaction, 'You cannot mute a bot.');
        }

        if (target.roles.cache.has(muteRoleId)) {
            return embedService.error(interaction, 'This user is already muted.');
        }

        const punishErr = canPunishTarget(interaction.member, target);
        if (punishErr) return embedService.error(interaction, punishErr);

        let duration = null;
        if (durationStr) {
            duration = parseDuration(durationStr);
            if (duration === null) {
                return embedService.error(interaction, 'Invalid duration (e.g. `5m`, `1h`, `7d`, `1w`).');
            }
        }

        await interaction.deferReply({ flags: 64 });

        const muteError = await target.roles.add(muteRole, reason).then(() => null).catch(err => err);
        if (muteError) {
            await errorService.commandError(client, muteError, interaction, 'mute:add-role', { targetId: target.id, muteRoleId });
            return embedService.error(interaction, `Mute failed: ${muteError.message}`);
        }

        const logResult = await logModAction(client, {
            guildId: interaction.guild.id,
            action: 'mute',
            moderatorId: interaction.user.id,
            targetId: target.id,
            reason,
            duration,
            proof,
        });
        const infraction = logResult?.infraction;

        if (!infraction) {
            await target.roles.remove(muteRole, 'Mute logging failed; rolling back').catch(err =>
                errorService.commandError(client, err, interaction, 'mute:rollback-role', { targetId: target.id, muteRoleId })
            );
            return embedService.error(interaction, 'Mute failed because the infraction could not be recorded. The mute role was removed.');
        }

        if (duration && infraction?.expires_at) {
            scheduleInfractionExpiry(client, infraction);
        }

        return embedService.modActionSuccess(interaction, {
            action: 'mute',
            targetId: target.id,
            caseNumber: infraction.case_number,
            guildId: interaction.guild.id,
            reason,
            duration: duration ? durationStr : 'Permanent',
            proof,
        });
    }
}
