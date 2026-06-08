import { embedService } from "../../../services/embedService.js";
import { getGuildConfig } from "../../../services/guildConfig.js";
import { logModAction } from "../../../services/moderationService.js";

export default {
    name: 'unmute',
    async execute(message, args, client) {

        if (!args.length) {
            return embedService.usage(message, 'unmute <targetID> [reason]', client);
        }

        const config = await getGuildConfig(message.guild.id, client);
        const muteRoleId = config?.muteRoleId;
        if (!muteRoleId) {
            return embedService.error(message, 'Server Mute role is not configured.');
        }

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (!target.roles.cache.has(muteRoleId)) {
            return embedService.error(message, 'This user is not muted.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        const { rows } = await client.db.query(
            `SELECT id, case_number FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [message.guild.id, target.id]
        );
        const originalInfractionId = rows[0]?.id;
        const originalCaseNumber = rows[0]?.case_number;

        const unmuteError = await target.roles.remove(muteRoleId, reason).then(() => null).catch(err => err);
        if (unmuteError) {
            return embedService.error(message, `Unmute failed: ${unmuteError.message}`);
        }

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'mute' AND active = true`,
            [message.guild.id, target.id]
        );

        const logResult = await logModAction(client, {
            guildId: message.guild.id,
            action: 'unmute',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        if (!logResult?.modAction) {
            return embedService.error(message, 'Unmute completed, but the moderation action could not be recorded.');
        }

        return embedService.modActionSuccess(message, {
            action: 'unmute',
            targetId: target.id,
            caseNumber: originalCaseNumber,
            guildId: message.guild.id,
            reason,
        });
    },
}
