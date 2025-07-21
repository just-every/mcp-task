export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
}

export class Logger {
    private level: LogLevel;
    private name: string;
    private quiet: boolean;

    constructor(name: string, level: LogLevel = LogLevel.INFO) {
        this.name = name;
        this.level = level;
        // In MCP mode, only output errors unless explicitly in debug mode
        this.quiet =
            process.env.MCP_QUIET === 'true' ||
            (!process.env.MCP_DEBUG && this.name === 'MCP');
    }

    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (level > this.level) return;

        // In quiet mode, only output errors
        if (this.quiet && level !== LogLevel.ERROR) return;

        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level];
        const prefix = `[${timestamp}] [${levelName}] [${this.name}]`;

        // Always use stderr for MCP servers to avoid stdout conflicts
        switch (level) {
            case LogLevel.ERROR:
                console.error(prefix, message, ...args);
                break;
            case LogLevel.WARN:
                console.error(prefix, message, ...args);
                break;
            default:
                console.error(prefix, message, ...args);
        }
    }

    error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, ...args);
    }

    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, ...args);
    }

    info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, ...args);
    }

    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }
}

// Global logger instance
export const logger = new Logger('MCP');

// Set log level from environment
const envLevel = process.env.LOG_LEVEL?.toUpperCase();
if (envLevel && envLevel in LogLevel) {
    logger.setLevel(
        LogLevel[envLevel as keyof typeof LogLevel] as unknown as LogLevel
    );
}
