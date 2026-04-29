import { embedService } from "../../../services/embedService.js";

export default {
    name: 'servericoninfo',
    async execute(message, args, client) {
        if (!message.guild) {
            return embedService.error(message, 'This command can only be used in a server.');
        }

        return embedService.serverIconInfo(message, message.guild);
    }
}