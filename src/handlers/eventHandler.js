import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { logger } from '../utils/logger.js';
import { errorService } from '../services/errorService.js';

function getEventGuildId(args) {
    for (const arg of args) {
        if (arg?.guildId) return arg.guildId;
        if (arg?.guild?.id) return arg.guild.id;
        if (arg?.channels?.cache && arg?.members?.cache && arg?.id) return arg.id;
    }
    return null;
}

async function executeEvent(event, args, client) {
    try {
        await event.execute(...args, client);
    } catch (err) {
        const guildId = getEventGuildId(args);
        logger.error(`Event error [${event.name}]:`, err);

        if (guildId) {
            await errorService.error(client, err, {
                guildId,
                source: 'discord-event',
                operation: event.name,
            });
        }
    }
}

async function loadFromDir(dirPath, client) {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            await loadFromDir(fullPath, client);
            continue;
        }

        if (!entry.name.endsWith('.js')) continue;

        const event = (await import(pathToFileURL(fullPath).href)).default;

        if (!event?.name || !event?.execute) {
            logger.warn(`Skipping invalid event file: ${entry.name}`);
            continue;
        }

        if (event.once) {
            client.once(event.name, (...args) => executeEvent(event, args, client));
        } else {
            client.on(event.name, (...args) => executeEvent(event, args, client));
        }

        logger.info(`Loaded event: ${event.name}`);
    }
}

export async function loadEvents(client) {
    const eventsPath = path.resolve('src/events');
    await loadFromDir(eventsPath, client);
}
