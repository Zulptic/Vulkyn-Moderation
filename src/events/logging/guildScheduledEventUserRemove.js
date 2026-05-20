import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'guildScheduledEventUserRemove',
    execute: (event, user, client) => {
        loggingService.scheduledEventUserRemove(event, user, client);
    },
};
