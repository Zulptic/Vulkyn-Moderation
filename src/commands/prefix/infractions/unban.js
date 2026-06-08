import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

export default {
    name: 'unban',
    async execute(message, args, client) {
        if (!args.length) {
            return embedService.usage(message, 'unban <userID> [reason]', client);
        }

        const userId = args[0];
        const ban = await message.guild.bans.fetch(userId).catch(() => null);
        if (!ban) {
            return embedService.error(message, 'That user is not banned.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        const { rows } = await client.db.query(
            `SELECT id, case_number FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'ban' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [message.guild.id, userId]
        );
        const originalInfractionId = rows[0]?.id;
        const originalCaseNumber = rows[0]?.case_number;

        const unbanError = await message.guild.members.unban(userId, reason).then(() => null).catch(err => err);
        if (unbanError) {
            return embedService.error(message, `Unban failed: ${unbanError.message}`);
        }

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'ban' AND active = true`,
            [message.guild.id, userId]
        );

        const logResult = await logModAction(client, {
            guildId: message.guild.id,
            action: 'unban',
            moderatorId: message.author.id,
            targetId: userId,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        if (!logResult?.modAction) {
            return embedService.error(message, 'Unban completed, but the moderation action could not be recorded.');
        }

        return embedService.modActionSuccess(message, {
            action: 'unban',
            targetId: userId,
            caseNumber: originalCaseNumber,
            guildId: message.guild.id,
            reason,
        });
    },
};
