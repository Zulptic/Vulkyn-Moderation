import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'guildScheduledEventCreate',
    execute: (event, client) => {
        loggingService.scheduledEventCreate(event, client);
    },
};
