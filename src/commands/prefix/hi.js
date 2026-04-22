export default {
    name: 'hi',
    async execute(message, args, client) {
        await message.reply('Hi!');
    },
};