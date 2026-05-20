import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'emojiDelete',
    execute: (emoji, client) => {
        loggingService.emojiDelete(emoji, client);
    },
};
