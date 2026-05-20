import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'emojiUpdate',
    execute: (oldEmoji, newEmoji, client) => {
        if (oldEmoji.name !== newEmoji.name) {
            loggingService.emojiNameUpdate(oldEmoji, newEmoji, client);
        }
        const oldRoleIds = [...oldEmoji.roles.cache.keys()].sort().join(',');
        const newRoleIds = [...newEmoji.roles.cache.keys()].sort().join(',');
        if (oldRoleIds !== newRoleIds) {
            loggingService.emojiRolesUpdate(oldEmoji, newEmoji, client);
        }
    },
};
