import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'guildScheduledEventUpdate',
    execute: (oldEvent, newEvent, client) => {
        if (oldEvent.name !== newEvent.name) {
            loggingService.scheduledEventNameUpdate(oldEvent, newEvent, client);
        }
        if ((oldEvent.description ?? null) !== (newEvent.description ?? null)) {
            loggingService.scheduledEventDescriptionUpdate(oldEvent, newEvent, client);
        }
        if (
            oldEvent.channelId !== newEvent.channelId ||
            (oldEvent.entityMetadata?.location ?? null) !== (newEvent.entityMetadata?.location ?? null)
        ) {
            loggingService.scheduledEventLocationUpdate(oldEvent, newEvent, client);
        }
        if (oldEvent.privacyLevel !== newEvent.privacyLevel) {
            loggingService.scheduledEventPrivacyLevelUpdate(oldEvent, newEvent, client);
        }
        if (oldEvent.scheduledStartTimestamp !== newEvent.scheduledStartTimestamp) {
            loggingService.scheduledEventStartTimeUpdate(oldEvent, newEvent, client);
        }
        if ((oldEvent.scheduledEndTimestamp ?? null) !== (newEvent.scheduledEndTimestamp ?? null)) {
            loggingService.scheduledEventEndTimeUpdate(oldEvent, newEvent, client);
        }
        if (oldEvent.status !== newEvent.status) {
            loggingService.scheduledEventStatusUpdate(oldEvent, newEvent, client);
        }
        if ((oldEvent.image ?? null) !== (newEvent.image ?? null)) {
            loggingService.scheduledEventImageUpdate(oldEvent, newEvent, client);
        }
    },
};
