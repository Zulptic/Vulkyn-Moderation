import {embedService} from "../../../services/embedService.js";

export default {
    name: 'channelinfo',
    async execute(message, args, client) {
        if (!args.length) {
            return embedService.usage(message, 'channelinfo <channelID>', client);
        }

        const channel = message.mentions.channels.first() || client.channels.cache.get(args[0]) || null;

        if (!channel) {
            return embedService.error(message, 'Please provide a valid channel ID.');
        }

        return embedService.channelInfo(message, channel);
    }
}