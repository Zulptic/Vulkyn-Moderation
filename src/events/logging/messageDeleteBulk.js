import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'messageDeleteBulk',
    execute: (messages, channel, client) => {
        loggingService.messageBulkDelete(messages, channel, client);
    },
};