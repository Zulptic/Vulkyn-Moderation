import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { REST, Routes } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function loadFromDir(dirPath) {
    const commands = [];

    try {
        const files = await readdir(dirPath);
        const jsFiles = files.filter((f) => f.endsWith('.js'));

        for (const file of jsFiles) {
            const filePath = path.join(dirPath, file);
            const command = (await import(pathToFileURL(filePath).href)).default;

            if (!command?.name || !command?.execute) {
                logger.warn(`Skipping invalid command file: ${file}`);
                continue;
            }

            commands.push(command);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        logger.warn(`Command directory not found: ${dirPath}`);
    }

    return commands;
}

export async function syncGuildCommands(guildId, client) {
    const config = await getGuildConfig(guildId, client);
    const commandMode = config?.commandMode || 'both';

    if (commandMode === 'prefix') {
        try {
            await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
                { body: [] }
            );
            logger.info(`Cleared slash commands for guild ${guildId}`);
        } catch (err) {
            logger.error(`Failed to clear slash commands for guild ${guildId}:`, err);
        }
        return;
    }

    const disabledCommands = config?.disabledCommands || [];

    const body = client.slashCommands
        .filter((cmd) => cmd.data && !disabledCommands.includes(cmd.name))
        .map((cmd) => cmd.data.toJSON());

    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, guildId),
            { body }
        );
        logger.info(`Synced ${body.length} slash command(s) for guild ${guildId}`);
    } catch (err) {
        logger.error(`Failed to sync slash commands for guild ${guildId}:`, err);
    }
}

export async function loadCommands(client) {
    const slashPath = path.resolve('src/commands/slash');
    const prefixPath = path.resolve('src/commands/prefix');

    const slashCommands = await loadFromDir(slashPath);
    for (const cmd of slashCommands) {
        client.slashCommands.set(cmd.name, cmd);
        logger.info(`Loaded slash command: ${cmd.name}`);
    }

    const prefixCommands = await loadFromDir(prefixPath);
    for (const cmd of prefixCommands) {
        client.prefixCommands.set(cmd.name, cmd);
        logger.info(`Loaded prefix command: ${cmd.name}`);
    }

    try {
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: [] });
        logger.info('Cleared global slash commands');
    } catch (err) {
        logger.error('Failed to clear global slash commands:', err);
    }

    client.syncGuildCommands = syncGuildCommands;
}