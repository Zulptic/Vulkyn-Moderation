import {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    SectionBuilder,
    ButtonBuilder,
    ActionRowBuilder,
    ButtonStyle,
    ComponentType,
    MessageFlags,
} from 'discord.js';
import { embedService } from '../../../services/embedService.js';

const ROLES_PER_PAGE = 15;
const COLLECTOR_TIMEOUT = 120_000;

function formatRoleList(roles, page) {
    const start = page * ROLES_PER_PAGE;
    const slice = roles.slice(start, start + ROLES_PER_PAGE);

    return slice
        .map((r, i) => `\`${start + i + 1}.\` <@&${r.id}>`)
        .join('\n');
}

function buildPaginationRow(page, totalPages, uniqueId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`roleinfo_prev_${uniqueId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`roleinfo_page_${uniqueId}`)
            .setLabel(`Page ${page + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`roleinfo_next_${uniqueId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages - 1),
    );
}

function buildServerRolesContainer(guild, roles, page, totalPages, uniqueId) {
    const iconUrl = guild.iconURL({ extension: 'png', size: 256 })
        ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

    const headerLines = [
        `${embedService.EMOJI.info} **|** ${guild.name}'s roles\n`,
        `**Total Roles:** \`${roles.length}\``,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(embedService.COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(headerLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(iconUrl))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Roles:**\n${formatRoleList(roles, page)}`)
        );

    if (totalPages > 1) {
        container
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addActionRowComponents(buildPaginationRow(page, totalPages, uniqueId));
    }

    container
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`ID: \`${guild.id}\``)
        );

    return container;
}

function buildMemberRolesContainer(member, roles, page, totalPages, uniqueId) {
    const topRole = member.roles.highest;

    const headerLines = [
        `${embedService.EMOJI.info} **|** @${member.user.username}'s roles\n`,
        `**Top Role:** <@&${topRole.id}>`,
        `**Total Roles:** \`${roles.length}\``,
    ];

    const container = new ContainerBuilder()
        .setAccentColor(topRole.color || embedService.COLORS.info)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(td => td.setContent(headerLines.join('\n')))
                .setThumbnailAccessory(thumb => thumb.setURL(member.user.displayAvatarURL()))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Roles:**\n${formatRoleList(roles, page)}`)
        );

    if (totalPages > 1) {
        container
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addActionRowComponents(buildPaginationRow(page, totalPages, uniqueId));
    }

    container
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`User ID: \`${member.id}\``)
        );

    return container;
}

function setupCollector(sentMessage, buildFn, totalPages, uniqueId, authorId) {
    if (totalPages <= 1) return;

    let currentPage = 0;

    const collector = sentMessage.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: COLLECTOR_TIMEOUT,
        filter: (i) => i.customId.endsWith(uniqueId) && i.user.id === authorId,
    });

    collector.on('collect', async (interaction) => {
        if (interaction.customId === `roleinfo_prev_${uniqueId}`) {
            currentPage = Math.max(0, currentPage - 1);
        } else if (interaction.customId === `roleinfo_next_${uniqueId}`) {
            currentPage = Math.min(totalPages - 1, currentPage + 1);
        }

        const container = buildFn(currentPage);

        await interaction.update({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });
    });

    collector.on('end', async () => {
        const container = buildFn(currentPage);

        // Disable all buttons on expiry by rebuilding with all disabled
        const expiredRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`roleinfo_prev_${uniqueId}`)
                .setLabel('◀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`roleinfo_page_${uniqueId}`)
                .setLabel(`Page ${currentPage + 1}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`roleinfo_next_${uniqueId}`)
                .setLabel('▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
        );

        const expiredContainer = buildFn(currentPage, expiredRow);

        await sentMessage.edit({
            components: [expiredContainer],
            flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
    });
}

async function sendPaginatedServerRoles(message, guild) {
    const roles = guild.roles.cache
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map(r => r);

    if (roles.length === 0) {
        return embedService.error(message, 'This server has no roles.');
    }

    const totalPages = Math.ceil(roles.length / ROLES_PER_PAGE);
    const uniqueId = `${message.id}`;

    const buildFn = (page, overrideRow) => {
        const iconUrl = guild.iconURL({ extension: 'png', size: 256 })
            ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

        const headerLines = [
            `${embedService.EMOJI.info} **|** ${guild.name}'s roles\n`,
            `**Total Roles:** \`${roles.length}\``,
        ];

        const container = new ContainerBuilder()
            .setAccentColor(embedService.COLORS.info)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(td => td.setContent(headerLines.join('\n')))
                    .setThumbnailAccessory(thumb => thumb.setURL(iconUrl))
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Roles:**\n${formatRoleList(roles, page)}`)
            );

        if (totalPages > 1) {
            container
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addActionRowComponents(
                    overrideRow ?? buildPaginationRow(page, totalPages, uniqueId)
                );
        }

        container
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`ID: \`${guild.id}\``)
            );

        return container;
    };

    const container = buildFn(0);

    const sentMessage = await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { repliedUser: false },
    });

    setupCollector(sentMessage, buildFn, totalPages, uniqueId, message.author.id);
    return sentMessage;
}

async function sendPaginatedMemberRoles(message, member) {
    const roles = member.roles.cache
        .filter(r => r.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map(r => r);

    if (roles.length === 0) {
        return embedService.error(message, `${member.user.username} has no roles.`);
    }

    const totalPages = Math.ceil(roles.length / ROLES_PER_PAGE);
    const uniqueId = `${message.id}`;
    const topRole = member.roles.highest;

    const buildFn = (page, overrideRow) => {
        const headerLines = [
            `${embedService.EMOJI.info} **|** @${member.user.username}'s roles\n`,
            `**Top Role:** <@&${topRole.id}>`,
            `**Total Roles:** \`${roles.length}\``,
        ];

        const container = new ContainerBuilder()
            .setAccentColor(topRole.color || embedService.COLORS.info)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(td => td.setContent(headerLines.join('\n')))
                    .setThumbnailAccessory(thumb => thumb.setURL(member.user.displayAvatarURL()))
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Roles:**\n${formatRoleList(roles, page)}`)
            );

        if (totalPages > 1) {
            container
                .addSeparatorComponents(
                    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
                )
                .addActionRowComponents(
                    overrideRow ?? buildPaginationRow(page, totalPages, uniqueId)
                );
        }

        container
            .addSeparatorComponents(
                new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`User ID: \`${member.id}\``)
            );

        return container;
    };

    const container = buildFn(0);

    const sentMessage = await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { repliedUser: false },
    });

    setupCollector(sentMessage, buildFn, totalPages, uniqueId, message.author.id);
    return sentMessage;
}

export default {
    name: 'roleinfo',
    async execute(message, args, client) {
        if (!message.guild) {
            return embedService.error(message, 'This command can only be used in a server.');
        }

        // No args → show server role list
        if (!args.length) {
            return sendPaginatedServerRoles(message, message.guild);
        }

        const input = args.join(' ');
        let foundRole = null;
        let foundMember = null;

        const roleMention = input.match(/^<@&(\d+)>$/);
        const memberMention = input.match(/^<@!?(\d+)>$/);

        if (roleMention) {
            foundRole = message.guild.roles.cache.get(roleMention[1]);
        } else if (memberMention) {
            foundMember = await message.guild.members.fetch(memberMention[1]).catch(() => null);
        } else if (/^\d{17,20}$/.test(input)) {
            foundRole = message.guild.roles.cache.get(input);
            if (!foundRole) {
                foundMember = await message.guild.members.fetch(input).catch(() => null);
            }
        } else {
            foundRole = message.guild.roles.cache.find(r =>
                r.name.toLowerCase() === input.toLowerCase() ||
                r.name.toLowerCase().includes(input.toLowerCase())
            );

            if (!foundRole) {
                foundMember = message.guild.members.cache.find(m =>
                    m.user.username.toLowerCase() === input.toLowerCase() ||
                    m.displayName.toLowerCase() === input.toLowerCase() ||
                    m.user.username.toLowerCase().includes(input.toLowerCase())
                );
            }
        }

        if (foundRole && foundMember) {
            return embedService.error(
                message,
                `I found both a **Role** and a **Member** matching "${input}". Please mention (@) the specific one you want to inspect.`
            );
        }

        if (foundRole) {
            return embedService.roleInfo(message, foundRole);
        }

        if (foundMember) {
            return sendPaginatedMemberRoles(message, foundMember);
        }

        return embedService.error(message, 'Could not find a role or member matching that input.');
    },
};