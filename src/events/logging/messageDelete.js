import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'messageDelete',
    execute: (message, client) => {
        loggingService.messageDelete(message, client);
    },
};