import { embedService } from "../../../services/embedService.js";

export default {
    name: 'serverinfo',
    async execute(message, args, client) {
        if (!message.guild) {
            return embedService.error(message, 'This command can only be used in a server.');
        }

        const guild = message.guild;
        let inviteUrl = null;
        if (guild.vanityURLCode) {
            inviteUrl = `https://discord.gg/${guild.vanityURLCode}`;
        } else {
            try {
                const invites = await guild.invites.fetch();
                const permanent = invites.find(i => i.maxAge === 0 && i.maxUses === 0);
                if (permanent) {
                    inviteUrl = permanent.url;
                } else if (invites.size > 0) {
                    inviteUrl = invites.first().url;
                }
            } catch {

            }

            if (!inviteUrl) {
                try {
                    const channel = guild.systemChannel
                        ?? guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));

                    if (channel) {
                        const invite = await channel.createInvite({
                            maxAge: 0,
                            maxUses: 0,
                            unique: false,
                            reason: 'serverinfo command',
                        });
                        inviteUrl = invite.url;
                    }
                } catch {

                }
            }
        }

        if (inviteUrl) {
            await message.channel.send({
                content: inviteUrl,
                allowedMentions: { repliedUser: false },
            });
        }

        return embedService.guildInfo(message, guild);
    }
}