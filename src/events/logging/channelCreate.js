import { ChannelType } from 'discord.js';
import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'channelCreate',
    execute: (channel, client) => {
        if (channel.type === ChannelType.GuildCategory) {
            loggingService.categoryCreate(channel, client);
        } else {
            loggingService.channelCreate(channel, client);
        }
    },
};