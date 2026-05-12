import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'channelDelete',
    execute: (channel, client) => loggingService.channelDelete(channel, client),
};