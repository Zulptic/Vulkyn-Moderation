import { createInfraction } from "../../../services/moderationService.js";
import interaction from "pg/lib/client";

export default {
    name: 'ban',
    async execute(message, args, client) {

        const target = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);
        if (!target) {
            return message.reply('Please mention a user or provide a valid user ID for argument.')
        }

        if (target.id === interaction.author.id) {
            return message.reply({ content: 'Are you sure you provided the correct ID? You provided your own Discord ID!'});
        }

        if (target.user.bot) {
            return message.reply('You cannot ban a bot!')
        }

    }
}