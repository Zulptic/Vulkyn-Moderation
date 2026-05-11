import { embedService } from '../../../services/embedService.js';
import { logModAction } from '../../../services/moderationService.js';

export default {
    name: 'untimeout',
    async execute(message, args, client) {
        if (!args.length) {
            return embedService.usage(message, 'untimeout <targetID> [reason]', client);
        }

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        if (!target.communicationDisabledUntil) {
            return embedService.error(message, 'This user is not timed out.');
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        const { rows } = await client.db.query(
            `SELECT id FROM infractions WHERE guild_id = $1 AND user_id = $2 AND type = 'timeout' AND active = true ORDER BY created_at DESC LIMIT 1`,
            [message.guild.id, target.id]
        );
        const originalInfractionId = rows[0]?.id;

        await target.timeout(null, reason);

        await client.db.query(
            `UPDATE infractions SET active = false WHERE guild_id = $1 AND user_id = $2 AND type = 'timeout' AND active = true`,
            [message.guild.id, target.id]
        );

        await logModAction(client, {
            guildId: message.guild.id,
            action: 'untimeout',
            moderatorId: message.author.id,
            targetId: target.id,
            reason,
            metadata: { infractionId: originalInfractionId },
        });

        return embedService.modActionSuccess(message, {
            action: 'untimeout',
            targetId: target.id,
            caseNumber: originalInfractionId,
            guildId: message.guild.id,
            reason,
        });
    },
};
