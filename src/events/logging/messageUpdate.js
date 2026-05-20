import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'messageUpdate',
    execute: (oldMessage, newMessage, client) => {
        if (oldMessage.partial || newMessage.partial) return;
        if (newMessage.author?.bot) return;

        if (oldMessage.content !== newMessage.content) {
            loggingService.messageEdit(oldMessage, newMessage, client);
        }
        if (!oldMessage.flags.has('Crossposted') && newMessage.flags.has('Crossposted')) {
            loggingService.messagePublish(oldMessage, newMessage, client);
        }
    },
};