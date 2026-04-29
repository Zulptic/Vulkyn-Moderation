import {embedService} from "../../../services/embedService.js";

export default {
    name: 'stickerinfo',
    async execute(message, args, client) {
        if (message.reference) {
            try {
                const referenced = await message.fetchReference();
                if (referenced.stickers.size > 0) {
                    const sticker = referenced.stickers.first();
                    const fetched = await sticker.fetch().catch(() => sticker);
                    return embedService.stickerInfo(message, fetched);
                }
            } catch {
                // falls through
            }
        }

        if (message.stickers.size > 0) {
            const sticker = message.stickers.first();
            const fetched = await sticker.fetch().catch(() => sticker);
            return embedService.stickerInfo(message, fetched);
        }

        if (args.length && /^\d{17,20}$/.test(args[0])) {
            try {
                const sticker = await client.fetchSticker(args[0]);
                return embedService.stickerInfo(message, sticker);
            } catch {
                return embedService.error(message, 'Could not find a sticker attached to that ID');
            }
        }

        return embedService.usage(message, 'stickerinfo <sticker_id> | reply to a message with a sticker', client)
    }
}