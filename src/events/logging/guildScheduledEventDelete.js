import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'guildScheduledEventDelete',
    execute: (event, client) => {
        loggingService.scheduledEventDelete(event, client);
    },
};
