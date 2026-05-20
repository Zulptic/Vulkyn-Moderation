import { loggingService } from '../../services/loggingService.js'

export default {
    name: 'inviteDelete',
    execute: (invite, client) => {
        loggingService.inviteDelete(invite, client);
    },
}