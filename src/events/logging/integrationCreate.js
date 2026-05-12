import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'raw',
    async execute(packet, _shardId, client) {
        if (packet.t !== 'INTEGRATION_CREATE') return;
        const d = packet.d;
        await loggingService.integrationCreate({
            id: d.id,
            name: d.name,
            type: d.type,
            guildId: d.guild_id,
            iconURL: d.application?.icon
                ? `https://cdn.discordapp.com/app-icons/${d.application.id}/${d.application.icon}.png`
                : null,
        }, client);
    },
};
