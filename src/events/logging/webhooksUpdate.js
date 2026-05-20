import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'webhooksUpdate',
    execute: (channel, client) => {
        loggingService.webhooksUpdate(channel, client);
    },
};