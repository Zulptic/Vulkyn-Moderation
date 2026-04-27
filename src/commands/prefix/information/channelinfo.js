import {embedService} from "../../../services/embedService.js";

export default {
    name: 'channelinfo',
    async execute(message, args, client) {
        const channel =
            message.mentions.channels.first() ||
            client.channels.cache.get(args[0]) ||
            null;

        return embedService.channelInfo(message, channel);
    }
}