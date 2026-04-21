const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

function format(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const shard = process.env.HOSTNAME?.match(/-(\d+)$/)?.[1] ?? process.env.SHARD_ID ?? '0';
    return [`[${timestamp}] [SHARD ${shard}] [${level.toUpperCase()}] ${message}`, ...args];
}

export const logger = {
    error: (message, ...args) => {
        if (CURRENT_LEVEL >= LOG_LEVELS.error) console.error(...format('error', message, ...args));
    },
    warn: (message, ...args) => {
        if (CURRENT_LEVEL >= LOG_LEVELS.warn) console.warn(...format('warn', message, ...args));
    },
    info: (message, ...args) => {
        if (CURRENT_LEVEL >= LOG_LEVELS.info) console.log(...format('info', message, ...args));
    },
    debug: (message, ...args) => {
        if (CURRENT_LEVEL >= LOG_LEVELS.debug) console.log(...format('debug', message, ...args));
    },
};