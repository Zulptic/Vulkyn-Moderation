import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'autoModerationRuleCreate',
    execute: (rule, client) => {
        loggingService.autoModRuleCreate(rule, client);
    },
};
