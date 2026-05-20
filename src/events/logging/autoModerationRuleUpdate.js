import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'autoModerationRuleUpdate',
    execute: (oldRule, newRule, client) => {
        if (!oldRule) return;
        const serializeActions = actions => actions.map(a => `${a.type}:${a.metadata?.channelId ?? ''}:${a.metadata?.durationSeconds ?? ''}`).sort().join('|');
        if (serializeActions(oldRule.actions) !== serializeActions(newRule.actions)) {
            loggingService.autoModRuleActionsUpdate(oldRule, newRule, client);
        }
        if (oldRule.name !== newRule.name) {
            loggingService.autoModRuleNameUpdate(oldRule, newRule, client);
        }
        if (oldRule.enabled !== newRule.enabled) {
            loggingService.autoModRuleToggle(oldRule, newRule, client);
        }
        const serializeMeta = rule => JSON.stringify({
            kw: [...(rule.triggerMetadata?.keywordFilter ?? [])].sort(),
            rx: [...(rule.triggerMetadata?.regexPatterns ?? [])].sort(),
            al: [...(rule.triggerMetadata?.allowList ?? [])].sort(),
            pr: [...(rule.triggerMetadata?.presets ?? [])].sort(),
            ml: rule.triggerMetadata?.mentionTotalLimit ?? null,
            rp: rule.triggerMetadata?.mentionRaidProtectionEnabled ?? false,
        });
        if (serializeMeta(oldRule) !== serializeMeta(newRule)) {
            loggingService.autoModRuleContentUpdate(oldRule, newRule, client);
        }
        const serializeIds = collection => [...collection.keys()].sort().join(',');
        if (serializeIds(oldRule.exemptRoles) !== serializeIds(newRule.exemptRoles)) {
            loggingService.autoModRuleRolesUpdate(oldRule, newRule, client);
        }
        if (serializeIds(oldRule.exemptChannels) !== serializeIds(newRule.exemptChannels)) {
            loggingService.autoModRuleChannelsUpdate(oldRule, newRule, client);
        }
    },
};
