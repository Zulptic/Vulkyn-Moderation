import {embedService} from "../../../services/embedService.js";

export default {
    name: 'info',
    async execute(message, args, client) {
        return embedService.botInfo(message, client);
    }
}