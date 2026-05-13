import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'channelPinsUpdate',
    execute: (channel, time, client) => loggingService.channelPinsUpdate(channel, time, client),
};
