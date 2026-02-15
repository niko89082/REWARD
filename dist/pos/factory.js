import { POSProvider } from '@prisma/client';
import { SquareProvider } from './providers/square/SquareProvider';
/**
 * Factory to create POS provider instances
 */
export function createPOSProvider(provider) {
    switch (provider) {
        case POSProvider.SQUARE:
            return new SquareProvider();
        default:
            throw new Error(`Unsupported POS provider: ${provider}`);
    }
}
/**
 * Get provider instance by enum value
 */
export function getPOSProvider(provider) {
    return createPOSProvider(provider);
}
//# sourceMappingURL=factory.js.map