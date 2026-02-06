import { POSProvider } from '@prisma/client';
import type { IPOSProvider } from './interfaces/IPOSProvider';
import { SquareProvider } from './providers/square/SquareProvider';

/**
 * Factory to create POS provider instances
 */
export function createPOSProvider(provider: POSProvider): IPOSProvider {
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
export function getPOSProvider(provider: POSProvider): IPOSProvider {
  return createPOSProvider(provider);
}
