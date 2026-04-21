import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { REST, Routes } from 'discord.js';
import { logger } from '../utils/logger.js';

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

    const shardId = process.env.HOSTNAME?.match(/-(\d+)$/)?.[1] ?? process.env.SHARD_ID ?? '0';

    if (shardId === '0' && slashCommands.length > 0) {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const body = slashCommands.filter((cmd) => cmd.data).map((cmd) => cmd.data.toJSON());

        try {
            await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body });
            logger.info(`Registered ${body.length} global slash command(s)`);
        } catch (err) {
            logger.error('Failed to register slash commands:', err);
        }
    }
}