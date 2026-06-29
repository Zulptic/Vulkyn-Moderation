import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { shouldIgnoreLog } from '../src/services/loggingService.js';

function makeClient(members = []) {
    const memberCache = new Collection(
        members.map(({ userId, roleIds }) => [
            userId,
            {
                roles: {
                    cache: new Collection(roleIds.map(roleId => [roleId, { id: roleId }])),
                },
            },
        ])
    );

    return {
        guilds: {
            cache: new Collection([
                ['guild-1', {
                    members: {
                        cache: memberCache,
                        fetch: async userId => memberCache.get(userId) ?? null,
                    },
                }],
            ]),
        },
    };
}

const emptyCategory = {
    ignoredChannels: [],
    ignoredRoles: [],
};

test('global ignored channels suppress every logging category', async () => {
    const ignored = await shouldIgnoreLog(
        makeClient(),
        'guild-1',
        { ignoredChannels: ['channel-1'], ignoredRoles: [] },
        emptyCategory,
        {},
        { channelIds: ['channel-1'] }
    );

    assert.equal(ignored, true);
});

test('category ignored channels only suppress matching source channels', async () => {
    const loggingConfig = { ignoredChannels: [], ignoredRoles: [] };
    const categoryConfig = { ignoredChannels: ['channel-2'], ignoredRoles: [] };

    assert.equal(await shouldIgnoreLog(
        makeClient(),
        'guild-1',
        loggingConfig,
        categoryConfig,
        {},
        { channelIds: ['channel-2'] }
    ), true);

    assert.equal(await shouldIgnoreLog(
        makeClient(),
        'guild-1',
        loggingConfig,
        categoryConfig,
        {},
        { channelIds: ['channel-3'] }
    ), false);
});

test('individual event ignored roles suppress members with those roles', async () => {
    const client = makeClient([
        { userId: 'user-1', roleIds: ['role-1', 'role-2'] },
    ]);

    const ignored = await shouldIgnoreLog(
        client,
        'guild-1',
        { ignoredChannels: [], ignoredRoles: [] },
        emptyCategory,
        { ignoredChannels: [], ignoredRoles: ['role-2'] },
        { userIds: ['user-1'] }
    );

    assert.equal(ignored, true);
});

test('unrelated channels and roles do not suppress a log', async () => {
    const client = makeClient([
        { userId: 'user-1', roleIds: ['role-1'] },
    ]);

    const ignored = await shouldIgnoreLog(
        client,
        'guild-1',
        { ignoredChannels: ['channel-1'], ignoredRoles: ['role-2'] },
        { ignoredChannels: ['channel-2'], ignoredRoles: ['role-3'] },
        { ignoredChannels: ['channel-3'], ignoredRoles: ['role-4'] },
        { channelIds: ['channel-4'], userIds: ['user-1'] }
    );

    assert.equal(ignored, false);
});
