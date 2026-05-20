import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'emojiCreate',
    execute: (emoji, client) => {
        loggingService.emojiCreate(emoji, client);
    },
};
