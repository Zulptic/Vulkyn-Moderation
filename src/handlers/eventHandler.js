import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { logger } from '../utils/logger.js';

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
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }

        logger.info(`Loaded event: ${event.name}`);
    }
}

export async function loadEvents(client) {
    const eventsPath = path.resolve('src/events');
    await loadFromDir(eventsPath, client);
}