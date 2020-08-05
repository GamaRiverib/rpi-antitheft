import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
// Imports the Google Cloud client library for Winston
// import { LoggingWinston } from '@google-cloud/logging-winston';

const level = process.env.LOGGER_LEVEL || "debug";

const { combine, timestamp, printf, label } = winston.format;
const logFormat = printf(m => `[${m.level}] [${m.label}] ${m.message}\t${m.data ? JSON.stringify(m.data) : ""}`);
const dateFormat = 'YYYY/MM/DD HH:mm:ss';
const logsPath = './logs';

// type CONSOLE_LEVELS = "silly" | "input" | "verbose" | "prompt" | "debug" | "info" | "data" | "help" | "warn" | "error";

// Create a Winston logger that streams to Stackdriver Logging
// Logs will be written to: "projects/YOUR_PROJECT_ID/logs/winston_log"
export function getLogger(service: string): winston.Logger {
    const loggerOptions: winston.LoggerOptions = { level, format: winston.format.json() };
    loggerOptions.transports = [];
    loggerOptions.transports.push(new winston.transports.Console({
        format: combine(label({ label: service }), timestamp({ format: dateFormat }), logFormat)
    }));
    loggerOptions.transports.push(new DailyRotateFile({
        filename: `${logsPath}/error-%DATE%.log`,
        format: combine(label({ label: service }), timestamp({ format: dateFormat }), logFormat),
        level: "error"
    }));
    loggerOptions.transports.push(new DailyRotateFile({
        filename: `${logsPath}/debug-%DATE%.log`,
        format: combine(label({ label: service }), timestamp({ format: dateFormat }), logFormat),
        level: "debug"
    }));
    // When use Google Cloud client library for Winston
    // loggerOptions.transports.push(new LoggingWinston({ prefix: service }));
    return winston.createLogger(loggerOptions);
}
