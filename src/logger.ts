

import * as winston from 'winston'

export const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'debug',
	format: winston.format.combine(
		winston.format.colorize(),
		winston.format.colorize({
		}),
		winston.format.timestamp({
			format: 'YY-MM-DD HH:mm:ss'
		}),
		winston.format.printf(
			(info) => `[${info.timestamp}] ${info.level}: ${info.message}`
		)
	),
	transports: [new winston.transports.Console()]
})