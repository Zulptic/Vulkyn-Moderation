import test from 'node:test';
import assert from 'node:assert/strict';
import { errorService } from '../src/services/errorService.js';

function createClient({ enabled = true, query } = {}) {
    return {
        shard: { ids: [3] },
        redis: {
            get: async () => JSON.stringify({
                general: { errorLogging: { enabled } },
            }),
        },
        db: {
            query: query ?? (async (_sql, params) => ({
                rows: [{ id: params[0] }],
            })),
        },
    };
}

test('warning records a guild-scoped warning with a generated reference ID', async () => {
    let insertParams;
    const client = createClient({
        query: async (_sql, params) => {
            insertParams = params;
            return { rows: [{ id: params[0] }] };
        },
    });

    const result = await errorService.warning(client, {
        guildId: '123456789012345678',
        code: 'MUTE_ROLE_NOT_CONFIGURED',
        source: 'command',
        operation: 'mute',
        message: 'Server Mute role is not configured.',
        context: { targetId: '987654321098765432' },
    });

    assert.equal(result.recorded, true);
    assert.match(result.id, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(insertParams[1], '123456789012345678');
    assert.equal(insertParams[2], 'warning');
    assert.equal(insertParams[3], 'MUTE_ROLE_NOT_CONFIGURED');
    assert.equal(insertParams[8], 3);
});

test('error captures the original error details and safe Discord metadata', async () => {
    let insertParams;
    const client = createClient({
        query: async (_sql, params) => {
            insertParams = params;
            return { rows: [{ id: params[0] }] };
        },
    });

    const discordError = new Error('Missing Permissions');
    discordError.code = 50013;
    discordError.status = 403;

    const result = await errorService.error(client, discordError, {
        guildId: '123456789012345678',
        source: 'slash-command',
        operation: 'mute',
    });

    assert.equal(result.recorded, true);
    assert.equal(insertParams[2], 'error');
    assert.equal(insertParams[3], '50013');
    assert.equal(insertParams[6], 'Missing Permissions');
    assert.match(insertParams[7], /Missing Permissions/);
    assert.deepEqual(JSON.parse(insertParams[9]), {
        discordCode: 50013,
        httpStatus: 403,
    });
});

test('disabled guild error logging does not write to the database', async () => {
    let queryCalls = 0;
    const client = createClient({
        enabled: false,
        query: async () => {
            queryCalls++;
            return { rows: [] };
        },
    });

    const result = await errorService.warning(client, {
        guildId: '123456789012345678',
        source: 'command',
        message: 'This should not be recorded.',
    });

    assert.deepEqual(result, {
        recorded: false,
        id: null,
        reason: 'disabled',
    });
    assert.equal(queryCalls, 0);
});

test('context is redacted and made JSON-safe before insertion', async () => {
    let insertParams;
    const circular = { value: 1 };
    circular.self = circular;

    const client = createClient({
        query: async (_sql, params) => {
            insertParams = params;
            return { rows: [{ id: params[0] }] };
        },
    });

    await errorService.warning(client, {
        guildId: '123456789012345678',
        source: 'service',
        message: 'Sanitization test',
        context: {
            botToken: 'do-not-store',
            count: 12n,
            circular,
        },
    });

    assert.deepEqual(JSON.parse(insertParams[9]), {
        botToken: '[REDACTED]',
        count: '12',
        circular: {
            value: 1,
            self: '[CIRCULAR]',
        },
    });
});

test('reference ID collisions are retried', async () => {
    let queryCalls = 0;
    const client = createClient({
        query: async (_sql, params) => {
            queryCalls++;
            if (queryCalls === 1) {
                const collision = new Error('duplicate key');
                collision.code = '23505';
                throw collision;
            }
            return { rows: [{ id: params[0] }] };
        },
    });

    const result = await errorService.warning(client, {
        guildId: '123456789012345678',
        source: 'service',
        message: 'Retry test',
    });

    assert.equal(result.recorded, true);
    assert.equal(queryCalls, 2);
});

test('commandError derives guild, source, actor, and channel context', async () => {
    let insertParams;
    const client = createClient({
        query: async (_sql, params) => {
            insertParams = params;
            return { rows: [{ id: params[0] }] };
        },
    });
    const interaction = {
        guildId: '123456789012345678',
        channelId: '222222222222222222',
        commandName: 'mute',
        user: { id: '333333333333333333' },
        isChatInputCommand: () => true,
    };

    await errorService.commandError(
        client,
        new Error('Missing Permissions'),
        interaction,
        'mute:add-role',
        { targetId: '444444444444444444' }
    );

    assert.equal(insertParams[4], 'slash-command');
    assert.equal(insertParams[5], 'mute:add-role');
    assert.deepEqual(JSON.parse(insertParams[9]), {
        command: 'mute',
        channelId: '222222222222222222',
        userId: '333333333333333333',
        targetId: '444444444444444444',
    });
});
