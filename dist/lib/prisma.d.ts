import { PrismaClient } from '@prisma/client';
/**
 * Prisma client singleton with query logging
 */
export declare const prisma: PrismaClient<{
    log: ({
        emit: "event";
        level: "query";
    } | {
        emit: "event";
        level: "error";
    } | {
        emit: "event";
        level: "warn";
    })[];
}, "error" | "warn" | "query", import("@prisma/client/runtime/library").DefaultArgs>;
//# sourceMappingURL=prisma.d.ts.map