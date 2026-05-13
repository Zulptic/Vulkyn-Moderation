import { loggingService } from '../../services/loggingService.js';

export default {
    name: 'channelUpdate',
    execute: (oldChannel, newChannel, client) => {
        if (oldChannel.name !== newChannel.name) {
            loggingService.channelNameUpdate(oldChannel, newChannel, client);
        }
        if ((oldChannel.topic ?? null) !== (newChannel.topic ?? null)) {
            loggingService.channelTopicUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.nsfw !== newChannel.nsfw) {
            loggingService.channelNSFWUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.parentId !== newChannel.parentId) {
            loggingService.channelParentUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.type !== newChannel.type) {
            loggingService.channelTypeUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.bitrate !== newChannel.bitrate) {
            loggingService.channelBitrateUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.userLimit !== newChannel.userLimit) {
            loggingService.channelUserLimitUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
            loggingService.channelSlowModeUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.rtcRegion !== newChannel.rtcRegion) {
            loggingService.channelRTCRegionUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.videoQualityMode !== newChannel.videoQualityMode) {
            loggingService.channelVideoQualityUpdate(oldChannel, newChannel, client);
        }
        if (oldChannel.defaultAutoArchiveDuration !== newChannel.defaultAutoArchiveDuration) {
            loggingService.channelDefaultArchiveDurationUpdate(oldChannel, newChannel, client);
        }
        if ((oldChannel.defaultThreadRateLimitPerUser ?? 0) !== (newChannel.defaultThreadRateLimitPerUser ?? 0)) {
            loggingService.channelDefaultThreadSlowModeUpdate(oldChannel, newChannel, client);
        }
        if ((oldChannel.defaultReactionEmoji?.id ?? oldChannel.defaultReactionEmoji?.name ?? null) !== (newChannel.defaultReactionEmoji?.id ?? newChannel.defaultReactionEmoji?.name ?? null)) {
            loggingService.channelDefaultReactionEmojiUpdate(oldChannel, newChannel, client);
        }
        if ((oldChannel.defaultSortOrder ?? null) !== (newChannel.defaultSortOrder ?? null)) {
            loggingService.channelDefaultSortOrderUpdate(oldChannel, newChannel, client);
        }
        if (JSON.stringify((oldChannel.availableTags ?? []).map(t => t.id).sort()) !== JSON.stringify((newChannel.availableTags ?? []).map(t => t.id).sort())) {
            loggingService.channelForumTagsUpdate(oldChannel, newChannel, client);
        }
        if ((oldChannel.defaultForumLayout ?? null) !== (newChannel.defaultForumLayout ?? null)) {
            loggingService.channelForumLayoutUpdate(oldChannel, newChannel, client);
        }
        if ((oldChannel.status ?? null) !== (newChannel.status ?? null)) {
            loggingService.channelVoiceStatusUpdate(oldChannel, newChannel, client);
        }
        const serializeOverwrites = ch => {
            try {
                return [...(ch.permissionOverwrites?.cache?.values() ?? [])]
                    .map(o => `${o.id}:${o.allow.bitfield.toString()}:${o.deny.bitfield.toString()}`)
                    .sort().join('|');
            } catch { return ''; }
        };
        if (serializeOverwrites(oldChannel) !== serializeOverwrites(newChannel)) {
            loggingService.channelPermissionsUpdate(oldChannel, newChannel, client);
        }
    },
};