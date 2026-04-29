import { embedService } from "../../../services/embedService.js";

export default {
    name: 'roleinfo',
    async execute(message, args, client) {
        if (!message.guild) {
            return embedService.error(message, 'This command can only be used in a server.');
        }

        if (!args.length) {
            return embedService.usage(message, 'roleinfo <@role | role id | role name>', client);
        }

        const input = args.join(' ');
        let role = null;

        const mentionMatch = input.match(/^<@&(\d+)>$/);
        if (mentionMatch) {
            role = message.guild.roles.cache.get(mentionMatch[1]);
        } else if (/^\d{17,20}$/.test(input)) {
            role = message.guild.roles.cache.get(input);
        } else {
            role = message.guild.roles.cache.find(r => r.name.toLowerCase() === input.toLowerCase())
                ?? message.guild.roles.cache.find(r => r.name.toLowerCase().includes(input.toLowerCase()));
        }

        if (!role) {
            return embedService.error(message, 'Could not find that role.');
        }

        return embedService.roleInfo(message, role);
    }
}