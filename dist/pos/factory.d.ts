import { POSProvider } from '@prisma/client';
import type { IPOSProvider } from './interfaces/IPOSProvider';
/**
 * Factory to create POS provider instances
 */
export declare function createPOSProvider(provider: POSProvider): IPOSProvider;
/**
 * Get provider instance by enum value
 */
export declare function getPOSProvider(provider: POSProvider): IPOSProvider;
//# sourceMappingURL=factory.d.ts.map