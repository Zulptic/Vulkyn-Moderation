import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'guildScheduledEventUserAdd',
    execute: (event, user, client) => {
        loggingService.scheduledEventUserAdd(event, user, client);
    },
};
