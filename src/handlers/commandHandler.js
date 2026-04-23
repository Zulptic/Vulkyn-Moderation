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
        const entries = await readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively load from subdirectories
                const subCommands = await loadFromDir(fullPath);
                commands.push(...subCommands);
                continue;
            }

            if (!entry.name.endsWith('.js')) continue;

            const command = (await import(pathToFileURL(fullPath).href)).default;

            if (!command?.name || !command?.execute) {
                logger.warn(`Skipping invalid command file: ${entry.name}`);
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

    // Load slash commands into memory
    const slashCommands = await loadFromDir(slashPath);
    for (const cmd of slashCommands) {
        client.slashCommands.set(cmd.name, cmd);
        logger.info(`Loaded slash command: ${cmd.name}`);
    }

    // Load prefix commands into memory
    const prefixCommands = await loadFromDir(prefixPath);
    for (const cmd of prefixCommands) {
        client.prefixCommands.set(cmd.name, cmd);
        logger.info(`Loaded prefix command: ${cmd.name}`);
    }

    // Clear global commands (we use guild-specific now)
    try {
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: [] });
        logger.info('Cleared global slash commands');
    } catch (err) {
        logger.error('Failed to clear global slash commands:', err);
    }

    // Attach sync function to client for use in events
    client.syncGuildCommands = syncGuildCommands;
}