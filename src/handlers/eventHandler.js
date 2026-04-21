import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { logger } from '../utils/logger.js';

export async function loadEvents(client) {
    const eventsPath = path.resolve('src/events');
    const files = await readdir(eventsPath);
    const eventFiles = files.filter((f) => f.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = (await import(pathToFileURL(filePath).href)).default;

        if (!event?.name || !event?.execute) {
            logger.warn(`Skipping invalid event file: ${file}`);
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