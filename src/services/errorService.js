import { randomInt } from 'crypto';
import { logger } from '../utils/logger.js';

const ID_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_SEGMENT_LENGTH = 4;
const MAX_ID_ATTEMPTS = 5;
const MAX_CONTEXT_DEPTH = 6;
const MAX_CONTEXT_STRING_LENGTH = 2000;
const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|cookie/i;

function createReferenceId() {
    const createSegment = () => Array.from(
        { length: ID_SEGMENT_LENGTH },
        () => ID_CHARACTERS[randomInt(ID_CHARACTERS.length)]
    ).join('');

    return `${createSegment()}-${createSegment()}`;
}

function truncate(value, maxLength) {
    if (value == null) return null;
    const stringValue = String(value);
    return stringValue.length > maxLength
        ? `${stringValue.slice(0, maxLength - 1)}…`
        : stringValue;
}

function sanitizeValue(value, key, depth, seen) {
    if (SENSITIVE_KEY_PATTERN.test(key)) return '[REDACTED]';
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'string') return truncate(value, MAX_CONTEXT_STRING_LENGTH);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (depth >= MAX_CONTEXT_DEPTH) return '[MAX_DEPTH]';

    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message,
            code: value.code ?? null,
        };
    }

    if (typeof value === 'object') {
        if (seen.has(value)) return '[CIRCULAR]';
        seen.add(value);

        if (Array.isArray(value)) {
            const sanitized = value
                .map(item => sanitizeValue(item, '', depth + 1, seen))
                .filter(item => item !== undefined);
            seen.delete(value);
            return sanitized;
        }

        const sanitized = {};
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
            const result = sanitizeValue(nestedValue, nestedKey, depth + 1, seen);
            if (result !== undefined) sanitized[nestedKey] = result;
        }

        seen.delete(value);
        return sanitized;
    }

    return truncate(value, MAX_CONTEXT_STRING_LENGTH);
}

function sanitizeContext(context) {
    if (!context || typeof context !== 'object') return {};
    return sanitizeValue(context, '', 0, new WeakSet()) ?? {};
}

function getShardId(client) {
    const clientShardId = client?.shard?.ids?.[0];
    if (Number.isInteger(clientShardId)) return clientShardId;

    const hostnameMatch = process.env.HOSTNAME?.match(/-(\d+)$/);
    const environmentShardId = hostnameMatch?.[1] ?? process.env.SHARD_ID;
    const parsed = Number.parseInt(environmentShardId, 10);

    return Number.isInteger(parsed) ? parsed : 0;
}

async function insertError(client, entry) {
    for (let attempt = 1; attempt <= MAX_ID_ATTEMPTS; attempt++) {
        const id = createReferenceId();

        try {
            const { rows } = await client.db.query(
                `INSERT INTO bot_errors
                 (id, guild_id, severity, error_code, source, operation, message, stack_trace, shard_id, context)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                    id,
                    entry.guildId,
                    entry.severity,
                    entry.errorCode,
                    entry.source,
                    entry.operation,
                    entry.message,
                    entry.stackTrace,
                    entry.shardId,
                    JSON.stringify(entry.context),
                ]
            );

            return {
                recorded: true,
                id,
                record: rows[0] ?? { id },
            };
        } catch (err) {
            if (err?.code === '23505' && attempt < MAX_ID_ATTEMPTS) continue;
            throw err;
        }
    }

    throw new Error('Unable to generate a unique error reference ID');
}

async function record(client, severity, details = {}) {
    const guildId = details.guildId ? String(details.guildId) : null;

    if (!guildId) {
        logger.warn('errorService skipped a report without a guildId');
        return { recorded: false, id: null, reason: 'missing_guild_id' };
    }

    try {
        return await insertError(client, {
            guildId,
            severity,
            errorCode: truncate(details.errorCode ?? details.code, 100),
            source: truncate(details.source ?? 'unknown', 100),
            operation: truncate(details.operation, 100),
            message: details.message ? String(details.message) : 'Unknown error',
            stackTrace: details.stackTrace ? String(details.stackTrace) : null,
            shardId: getShardId(client),
            context: sanitizeContext(details.context),
        });
    } catch (err) {
        logger.error(
            `errorService failed to record ${severity} for guild ${guildId}:`,
            err
        );
        return { recorded: false, id: null, reason: 'recording_failed' };
    }
}

async function warning(client, details = {}) {
    return record(client, 'warning', details);
}

async function error(client, err, details = {}) {
    const normalizedError = err instanceof Error
        ? err
        : new Error(typeof err === 'string' ? err : 'Unknown error');

    const context = {
        ...(details.context ?? {}),
        discordCode: normalizedError.code ?? undefined,
        httpStatus: normalizedError.status ?? normalizedError.httpStatus ?? undefined,
    };

    return record(client, 'error', {
        ...details,
        errorCode: details.errorCode ?? details.code ?? normalizedError.code ?? normalizedError.name,
        message: details.message ?? normalizedError.message,
        stackTrace: details.stackTrace ?? normalizedError.stack,
        context,
    });
}

function commandDetails(target, operation, context = {}) {
    const isSlashCommand = target?.isChatInputCommand?.() === true;
    const userId = isSlashCommand ? target.user?.id : target.author?.id;

    return {
        guildId: target?.guildId ?? target?.guild?.id,
        source: isSlashCommand ? 'slash-command' : 'prefix-command',
        operation,
        context: {
            command: isSlashCommand ? target.commandName : operation.split(':')[0],
            channelId: target?.channelId ?? target?.channel?.id,
            userId,
            ...context,
        },
    };
}

async function commandError(client, err, target, operation, context = {}) {
    return error(client, err, commandDetails(target, operation, context));
}

async function commandWarning(client, target, {
    code,
    operation,
    message,
    context = {},
}) {
    return warning(client, {
        ...commandDetails(target, operation, context),
        code,
        message,
    });
}

export const errorService = {
    warning,
    error,
    commandError,
    commandWarning,
};
