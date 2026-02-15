import { PrismaClient } from '@prisma/client';
import { logger } from './logger';
/**
 * Prisma client singleton with query logging
 */
export const prisma = new PrismaClient({
    log: [
        {
            emit: 'event',
            level: 'query',
        },
        {
            emit: 'event',
            level: 'error',
        },
        {
            emit: 'event',
            level: 'warn',
        },
    ],
});
// Log queries in development
prisma.$on('query', (e) => {
    if (process.env.NODE_ENV === 'development') {
        logger.debug({
            query: e.query,
            params: e.params,
            duration: `${e.duration}ms`,
        }, 'Prisma query');
    }
});
// Log errors
prisma.$on('error', (e) => {
    logger.error(e, 'Prisma error');
});
// Log warnings
prisma.$on('warn', (e) => {
    logger.warn(e, 'Prisma warning');
});
// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=prisma.js.map