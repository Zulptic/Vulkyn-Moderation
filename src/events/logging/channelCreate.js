import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'channelCreate',
    execute: (channel, client) => loggingService.channelCreate(channel, client),
};