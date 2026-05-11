import { SlashCommandBuilder, MessageFlags, ComponentType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import { embedService } from '../../../services/embedService.js';

const ROLES_PER_PAGE = 15;
const COLLECTOR_TIMEOUT = 120_000;

function formatRoleList(roles, page) {
    const start = page * ROLES_PER_PAGE;
    return roles
        .slice(start, start + ROLES_PER_PAGE)
        .map((r, i) => `\`${start + i + 1}.\` <@&${r.id}>`)
        .join('\n');
}

function buildPaginationRow(page, totalPages, uniqueId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`roleinfo_prev_${uniqueId}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || page === 0),
        new ButtonBuilder()
            .setCustomId(`roleinfo_page_${uniqueId}`)
            .setLabel(`Page ${page + 1}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`roleinfo_next_${uniqueId}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled || page === totalPages - 1),
    );
}

function buildServerRolesContainer(guild, roles, page, totalPages, uniqueId, expired = false) {
    const iconUrl = guild.iconURL({ extension: 'png', size: 256 })
        ?? 'https://cdn.discordapp.com/embed/avatars/0.png';

    const container = new ContainerBuilder()
        .setAccentColor(embedService.COLORS.info)
        .addSectionComponents(s => s
            .addTextDisplayComponents(td => td.setContent(
                `${embedService.EMOJI.info} **|** ${guild.name}'s roles\n\n**Total Roles:** \`${roles.length}\``
            ))
            .setThumbnailAccessory(t => t.setURL(iconUrl))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Roles:**\n${formatRoleList(roles, page)}`));

    if (totalPages > 1) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addActionRowComponents(buildPaginationRow(page, totalPages, uniqueId, expired));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`ID: \`${guild.id}\``));

    return container;
}

function buildMemberRolesContainer(member, roles, page, totalPages, uniqueId, expired = false) {
    const topRole = member.roles.highest;

    const container = new ContainerBuilder()
        .setAccentColor(topRole.color || embedService.COLORS.info)
        .addSectionComponents(s => s
            .addTextDisplayComponents(td => td.setContent(
                `${embedService.EMOJI.info} **|** @${member.user.username}'s roles\n\n**Top Role:** <@&${topRole.id}>\n**Total Roles:** \`${roles.length}\``
            ))
            .setThumbnailAccessory(t => t.setURL(member.user.displayAvatarURL()))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Roles:**\n${formatRoleList(roles, page)}`));

    if (totalPages > 1) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
            .addActionRowComponents(buildPaginationRow(page, totalPages, uniqueId, expired));
    }

    container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`User ID: \`${member.id}\``));

    return container;
}

function setupCollector(response, buildFn, totalPages, uniqueId, authorId) {
    if (totalPages <= 1) return;

    let currentPage = 0;

    const collector = response.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: COLLECTOR_TIMEOUT,
        filter: i => i.customId.endsWith(uniqueId) && i.user.id === authorId,
    });

    collector.on('collect', async i => {
        if (i.customId === `roleinfo_prev_${uniqueId}`) currentPage = Math.max(0, currentPage - 1);
        else if (i.customId === `roleinfo_next_${uniqueId}`) currentPage = Math.min(totalPages - 1, currentPage + 1);

        await i.update({ components: [buildFn(currentPage)], flags: MessageFlags.IsComponentsV2 });
    });

    collector.on('end', async () => {
        await response.edit({ components: [buildFn(currentPage, true)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
}

export default {
    name: 'roleinfo',
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Display role information or a member\'s roles')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to inspect'))
        .addUserOption(opt => opt.setName('user').setDescription('Show roles for this member')),
    async execute(interaction, client) {
        const roleOption = interaction.options.getRole('role');
        const userOption = interaction.options.getUser('user');

        if (roleOption && userOption) {
            return embedService.error(interaction, 'Please provide either a role or a user, not both.');
        }

        if (roleOption) {
            return embedService.roleInfo(interaction, roleOption);
        }

        if (userOption) {
            const member = await interaction.guild.members.fetch(userOption.id).catch(() => null);
            if (!member) return embedService.error(interaction, 'Could not find that member in this server.');

            const roles = member.roles.cache
                .filter(r => r.name !== '@everyone')
                .sort((a, b) => b.position - a.position)
                .map(r => r);

            if (roles.length === 0) return embedService.error(interaction, `${userOption.username} has no roles.`);

            const totalPages = Math.ceil(roles.length / ROLES_PER_PAGE);
            const uniqueId = interaction.id;
            const buildFn = (page, expired = false) => buildMemberRolesContainer(member, roles, page, totalPages, uniqueId, expired);

            const response = await interaction.reply({
                components: [buildFn(0)],
                flags: MessageFlags.IsComponentsV2,
                withResponse: true,
            });

            setupCollector(response.resource.message, buildFn, totalPages, uniqueId, interaction.user.id);
            return;
        }

        // No args — server role list
        const roles = interaction.guild.roles.cache
            .filter(r => r.name !== '@everyone')
            .sort((a, b) => b.position - a.position)
            .map(r => r);

        if (roles.length === 0) return embedService.error(interaction, 'This server has no roles.');

        const totalPages = Math.ceil(roles.length / ROLES_PER_PAGE);
        const uniqueId = interaction.id;
        const buildFn = (page, expired = false) => buildServerRolesContainer(interaction.guild, roles, page, totalPages, uniqueId, expired);

        const response = await interaction.reply({
            components: [buildFn(0)],
            flags: MessageFlags.IsComponentsV2,
            withResponse: true,
        });

        setupCollector(response.resource.message, buildFn, totalPages, uniqueId, interaction.user.id);
    },
};
