/**
 * Shared TypeScript types and interfaces
 */
import type { FastifyRequest } from 'fastify';
/**
 * Extended Fastify request with merchant authentication
 */
export interface AuthenticatedMerchantRequest extends FastifyRequest {
    merchantId: string;
    user: {
        merchantId: string;
        type: 'merchant';
    };
}
/**
 * Extended Fastify request with customer authentication
 */
export interface AuthenticatedCustomerRequest extends FastifyRequest {
    customerId: string;
    user: {
        customerId: string;
        type: 'customer';
    };
}
/**
 * API error response
 */
export interface ApiError {
    error: string;
    details?: any;
    stack?: string;
}
/**
 * Pagination parameters
 */
export interface PaginationParams {
    limit?: number;
    offset?: number;
}
/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    limit: number;
    offset: number;
}
//# sourceMappingURL=index.d.ts.map