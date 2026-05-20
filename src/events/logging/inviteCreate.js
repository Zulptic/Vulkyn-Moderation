import { loggingService } from '../../services/loggingService.js'

export default {
    name: 'inviteCreate',
    execute: (invite, client) => {
        loggingService.inviteCreate(invite, client);
    },
}