import { getGuildConfig } from './guildConfig.js';

export async function canUseCommand(member, commandName, client) {
    if (member.id === member.guild.ownerId) return true;
    if (member.permissions.has('Administrator')) return true;

    const config = await getGuildConfig(member.guild.id, client);

    const manageBotRoles = config?.permissions?.manageBot || [];
    if (manageBotRoles.length > 0 && member.roles.cache.some(role => manageBotRoles.includes(role.id))) {
        return true;
    }

    const commandRules = config?.permissions?.commandRules || [];

    if (commandRules.length > 0) {
        const allowedCommands = getCommandsForMember(member, commandRules);
        return allowedCommands.has(commandName);
    }

    return hasNativePermission(member, commandName);
}


export function canPunishTarget(executor, target) {
    if (!target) return null;
    if (target.id === executor.guild.ownerId) return 'You cannot punish the server owner.';
    if (target.roles.highest.comparePositionTo(executor.roles.highest) >= 0) {
        return 'You cannot punish someone with an equal or higher role than you.';
    }
    return null;
}

export async function canManageBot(member, client) {
    if (member.id === member.guild.ownerId) return true;

    if (member.permissions.has('Administrator')) return true;

    const config = await getGuildConfig(member.guild.id, client);
    const manageBotRoles = config?.permissions?.manageBot || [];

    return manageBotRoles.length > 0 && member.roles.cache.some(role => manageBotRoles.includes(role.id));
}

function getCommandsForMember(member, commandRules) {
    const allowedCommands = new Set();

    let matchedIndex = -1;

    for (let i = 0; i < commandRules.length; i++) {
        const rule = commandRules[i];
        const roleIds = rule.roleIds || [];

        if (member.roles.cache.some(role => roleIds.includes(role.id))) {
            matchedIndex = i;
            break;
        }
    }

    if (matchedIndex === -1) return allowedCommands;

    const matchedRule = commandRules[matchedIndex];

    for (const cmd of (matchedRule.commands || [])) {
        allowedCommands.add(cmd);
    }


    if (matchedRule.inherit) {
        for (let i = matchedIndex + 1; i < commandRules.length; i++) {
            for (const cmd of (commandRules[i].commands || [])) {
                allowedCommands.add(cmd);
            }
        }
    }

    for (const cmd of (matchedRule.deny || [])) {
        allowedCommands.delete(cmd);
    }

    return allowedCommands;
}

function hasNativePermission(member, commandName) {
    const permMap = {
        warn: 'ModerateMembers',
        mute: 'ModerateMembers',
        unmute: 'ModerateMembers',
        timeout: 'ModerateMembers',
        untimeout: 'ModerateMembers',
        userstatus: 'ModerateMembers',
        clearuserstatus: 'ModerateMembers',
        setuserstatus: 'ModerateMembers',
        multiwarn: 'ModerateMembers',
        multimute: 'ModerateMembers',
        multitimeout: 'ModerateMembers',
        kick: 'KickMembers',
        multikick: 'KickMembers',
        ban: 'BanMembers',
        softban: 'BanMembers',
        unban: 'BanMembers',
        multiban: 'BanMembers',
    };

    const required = permMap[commandName];
    if (!required) return false;

    return member.permissions.has(required);
}