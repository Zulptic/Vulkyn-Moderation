import { ChannelType } from 'discord.js';
import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'channelDelete',
    execute: (channel, client) => {
        if (channel.type === ChannelType.GuildCategory) {
            loggingService.categoryDelete(channel, client);
        } else {
            loggingService.channelDelete(channel, client);
        }
    },
};
