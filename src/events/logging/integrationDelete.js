import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'raw',
    async execute(packet, _shardId, client) {
        if (packet.t !== 'INTEGRATION_DELETE') return;
        const d = packet.d;
        await loggingService.integrationDelete({
            id: d.id,
            guildId: d.guild_id,
        }, client);
    },
};