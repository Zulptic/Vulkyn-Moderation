import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'applicationCommandPermissionsUpdate',
    execute: (data, client) => loggingService.applicationCommandPermissionsUpdate(data, client),
};
