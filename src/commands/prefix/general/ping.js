import {embedService} from "../../../services/embedService.js";

export default {
    name: 'ping',
    async execute(message, args, client) {
        return embedService.ping(message, client);
    }
}