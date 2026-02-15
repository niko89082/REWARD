import { prisma } from './src/lib/prisma.js';
import { POSProvider } from '@prisma/client';
import { encrypt } from './src/lib/crypto.js';

const merchantId = 'a30f3483-4f5e-45fd-a15a-349b0ff5a5cd';
const squareMerchantId = 'a30f3483-4f5e-45fd-a15a-349b0ff5a5cd'; // Using same ID for test

console.log('Creating POSIntegration...');

await prisma.pOSIntegration.create({
  data: {
    merchantId,
    provider: POSProvider.SQUARE,
    providerMerchantId: squareMerchantId,
    accessToken: encrypt('test-access-token'),
    refreshToken: null,
  },
});

console.log('✅ POSIntegration created!');
process.exit(0);
