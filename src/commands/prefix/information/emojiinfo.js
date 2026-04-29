import { embedService } from "../../../services/embedService.js";
import { find } from "node-emoji";

const unicodeEmojiRegex = /\p{Extended_Pictographic}/u;

export default {
    name: 'emojiinfo',
    async execute(message, args, client) {
        if (!args.length) {
            return embedService.usage(message, 'emojiinfo <emoji>', client);
        }

        const input = args[0];

        const customEmojiMatch = input.match(/^<(a?):(\w+):(\d+)>$/);
        if (customEmojiMatch) {
            const [, animated, name, id] = customEmojiMatch;
            const cachedEmoji = client.emojis.cache.get(id);

            if (cachedEmoji) {
                return embedService.emojiInfo(message, cachedEmoji);
            }

            return embedService.emojiInfo(message, {
                id,
                name,
                animated: animated === 'a',
                url: animated === 'a'
                    ? `https://cdn.discordapp.com/emojis/${id}.webp?size=256&animated=true`
                    : `https://cdn.discordapp.com/emojis/${id}.webp?size=256`,
                external: true
            });
        }

        if (unicodeEmojiRegex.test(input)) {
            const codepoints = [...input]
                .map(c => c.codePointAt(0).toString(16))
                .join('-');

            const shortcode = find(input)?.key ?? 'unknown';

            return embedService.emojiInfo(message, {
                name: shortcode,
                character: input,
                unicode: true,
                codepoints,
                url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codepoints}.png`
            });
        }

        if (/^\d{17,20}$/.test(input)) {
            const emoji = client.emojis.cache.get(input);
            if (emoji) {
                return embedService.emojiInfo(message, emoji);
            }
        }

        return embedService.error(message, 'Please provide a valid emoji.');
    }
}