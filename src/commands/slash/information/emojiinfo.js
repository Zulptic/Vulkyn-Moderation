import { SlashCommandBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';
import { find } from 'node-emoji';

const unicodeEmojiRegex = /\p{Extended_Pictographic}/u;

export default {
    name: 'emojiinfo',
    data: new SlashCommandBuilder()
        .setName('emojiinfo')
        .setDescription('Display information about an emoji')
        .addStringOption(opt => opt.setName('emoji').setDescription('Custom emoji, unicode emoji, or emoji ID').setRequired(true)),
    async execute(interaction, client) {
        const input = interaction.options.getString('emoji');

        const customEmojiMatch = input.match(/^<(a?):(\w+):(\d+)>$/);
        if (customEmojiMatch) {
            const [, animated, name, id] = customEmojiMatch;
            const cachedEmoji = client.emojis.cache.get(id);

            if (cachedEmoji) return embedService.emojiInfo(interaction, cachedEmoji);

            return embedService.emojiInfo(interaction, {
                id,
                name,
                animated: animated === 'a',
                url: animated === 'a'
                    ? `https://cdn.discordapp.com/emojis/${id}.webp?size=256&animated=true`
                    : `https://cdn.discordapp.com/emojis/${id}.webp?size=256`,
                external: true,
            });
        }

        if (unicodeEmojiRegex.test(input)) {
            const codepoints = [...input]
                .map(c => c.codePointAt(0).toString(16))
                .join('-');
            const shortcode = find(input)?.key ?? 'unknown';

            return embedService.emojiInfo(interaction, {
                name: shortcode,
                character: input,
                unicode: true,
                codepoints,
                url: `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codepoints}.png`,
            });
        }

        if (/^\d{17,20}$/.test(input)) {
            const emoji = client.emojis.cache.get(input);
            if (emoji) return embedService.emojiInfo(interaction, emoji);
        }

        return embedService.error(interaction, 'Please provide a valid emoji.');
    },
};
