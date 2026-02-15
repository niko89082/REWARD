import { logger } from '../lib/logger';
import { ZodError } from 'zod';
/**
 * Global error handler
 */
export async function errorHandler(error, request, reply) {
    // Log error
    logger.error({
        error: error.message,
        stack: error.stack,
        url: request.url,
        method: request.method,
    }, 'Request error');
    // Handle Zod validation errors
    if (error instanceof ZodError) {
        reply.code(400).send({
            error: 'Validation error',
            details: error.errors.map((err) => ({
                path: err.path.join('.'),
                message: err.message,
            })),
        });
        return;
    }
    // Handle Prisma errors
    if (error.constructor.name === 'PrismaClientKnownRequestError') {
        const prismaError = error;
        // Unique constraint violation
        if (prismaError.code === 'P2002') {
            reply.code(409).send({
                error: 'Resource already exists',
                details: prismaError.meta,
            });
            return;
        }
        // Record not found
        if (prismaError.code === 'P2025') {
            reply.code(404).send({
                error: 'Resource not found',
            });
            return;
        }
    }
    // Default error response
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500
        ? 'Internal server error'
        : error.message;
    reply.code(statusCode).send({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
}
//# sourceMappingURL=error.js.map