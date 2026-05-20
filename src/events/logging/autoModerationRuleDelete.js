import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'autoModerationRuleDelete',
    execute: (rule, client) => {
        loggingService.autoModRuleDelete(rule, client);
    },
};
