import * as winston from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

const { combine, timestamp, printf, label } = winston.format;
const logFormat = printf(m => `[${m.timestamp}]\t[${m.level}]\t[${m.label}]\t${m.message}\t${m.data ? JSON.stringify(m.data) : ""}`);
const dateFormat = 'YYYY/MM/DD HH:mm:ss';
const logsPath = './logs';

export class Logger {

    public static getLogger(category): winston.Logger {
        return winston.createLogger({
            level: "info",
            format: winston.format.json(),
            //defaultMeta: { service: "user-service" },
            transports: [
                new winston.transports.Console({
                    format: combine(label({ label: category }), timestamp({ format: dateFormat }), logFormat)
                }),
                new DailyRotateFile({ 
                    filename: `${logsPath}/error-%DATE%.log`,
                    format: combine(label({ label: category }), timestamp({ format: dateFormat }), logFormat),
                    level: "error" 
                }),
                new DailyRotateFile({ 
                    filename: `${logsPath}/debug-%DATE%.log`,
                    format: combine(label({ label: category }), timestamp({ format: dateFormat }), logFormat),
                    level: "info" 
                })
            ]
        });
    }
}