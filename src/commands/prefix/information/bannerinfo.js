import {embedService} from "../../../services/embedService.js";

export default {
    name: 'bannerinfo',
    async execute(message, args, client) {
        if (!args.length) {
            return embedService.usage(message, 'bannerinfo <targetID>', client);
        }

        const target = message.mentions.users.first() || await client.users.fetch(args[0]).catch(() => null);
        if (!target) {
            return embedService.error(message, 'Please mention a user or provide a valid user ID.');
        }

        const fullUser = await client.users.fetch(target.id, { force: true });

        return embedService.bannerInfo(message, fullUser);
    }
}