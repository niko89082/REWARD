import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { encrypt, decrypt } from '../lib/crypto';
import { POSProvider, RewardType } from '@prisma/client';
import { getPOSProvider } from '../pos/factory';
import type { GenericLocation } from '../pos/interfaces/IPOSProvider';

/**
 * Create merchant account
 * @param data - Merchant data
 */
export async function createMerchant(data: {
  email: string;
  password: string;
  name: string;
}) {
  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    const merchant = await prisma.merchant.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    logger.info({ merchantId: merchant.id, email: merchant.email }, 'Merchant created');
    return merchant;
  } catch (error) {
    logger.error({ error, email: data.email }, 'Failed to create merchant');
    throw error;
  }
}

/**
 * Verify merchant password
 * @param email - Merchant email
 * @param password - Plain text password
 * @returns Merchant if password is correct, null otherwise
 */
export async function verifyMerchantPassword(
  email: string,
  password: string
) {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { email },
    });

    if (!merchant) {
      return null;
    }

    const isValid = await bcrypt.compare(password, merchant.password);
    if (!isValid) {
      return null;
    }

    return {
      id: merchant.id,
      email: merchant.email,
      name: merchant.name,
      createdAt: merchant.createdAt,
    };
  } catch (error) {
    logger.error({ error, email }, 'Failed to verify merchant password');
    throw error;
  }
}

/**
 * Get merchant by ID
 * @param merchantId - Merchant ID
 */
export async function getMerchantById(merchantId: string) {
  try {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return merchant;
  } catch (error) {
    logger.error({ error, merchantId }, 'Failed to get merchant');
    throw error;
  }
}

/**
 * Link POS integration to merchant
 * @param merchantId - Merchant ID
 * @param provider - POS provider
 * @param credentials - OAuth credentials
 */
export async function linkPOSIntegration(
  merchantId: string,
  provider: POSProvider,
  credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    merchantId: string;
  }
) {
  try {
    logger.info({ merchantId, provider }, 'Linking POS integration');

    // Encrypt tokens before storing
    const encryptedAccessToken = encrypt(credentials.accessToken);
    const encryptedRefreshToken = credentials.refreshToken
      ? encrypt(credentials.refreshToken)
      : null;

    const expiresAt = credentials.expiresIn
      ? new Date(Date.now() + credentials.expiresIn * 1000)
      : null;

    const integration = await prisma.pOSIntegration.upsert({
      where: {
        merchantId_provider: {
          merchantId,
          provider,
        },
      },
      create: {
        merchantId,
        provider,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        providerMerchantId: credentials.merchantId,
        expiresAt,
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        providerMerchantId: credentials.merchantId,
        expiresAt,
      },
    });

    logger.info({ integrationId: integration.id, merchantId, provider }, 'POS integration linked');

    return integration;
  } catch (error) {
    logger.error({ error, merchantId, provider }, 'Failed to link POS integration');
    throw error;
  }
}

/**
 * Refresh access token
 * @param integrationId - POS integration ID
 */
export async function refreshAccessToken(integrationId: string) {
  try {
    const integration = await prisma.pOSIntegration.findUnique({
      where: { id: integrationId },
    });

    if (!integration) {
      throw new Error('POS integration not found');
    }

    if (!integration.refreshToken) {
      throw new Error('No refresh token available');
    }

    logger.info({ integrationId, provider: integration.provider }, 'Refreshing access token');

    // Decrypt refresh token
    const decryptedRefreshToken = decrypt(integration.refreshToken);

    // Get provider and refresh token
    const provider = getPOSProvider(integration.provider);
    const newCredentials = await provider.refreshAccessToken(decryptedRefreshToken);

    // Encrypt new tokens
    const encryptedAccessToken = encrypt(newCredentials.accessToken);
    const encryptedRefreshToken = newCredentials.refreshToken
      ? encrypt(newCredentials.refreshToken)
      : null;

    const expiresAt = newCredentials.expiresIn
      ? new Date(Date.now() + newCredentials.expiresIn * 1000)
      : null;

    // Update integration
    const updated = await prisma.pOSIntegration.update({
      where: { id: integrationId },
      data: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
      },
    });

    logger.info({ integrationId }, 'Access token refreshed');
    return updated;
  } catch (error) {
    logger.error({ error, integrationId }, 'Failed to refresh access token');
    throw error;
  }
}

/**
 * Sync locations from POS system
 * @param merchantId - Merchant ID
 * @param posIntegrationId - POS integration ID
 */
export async function syncLocations(
  merchantId: string,
  posIntegrationId: string
): Promise<void> {
  try {
    logger.info({ merchantId, posIntegrationId }, 'Syncing locations from POS');

    const integration = await prisma.pOSIntegration.findUnique({
      where: { id: posIntegrationId },
    });

    if (!integration) {
      throw new Error('POS integration not found');
    }

    if (integration.merchantId !== merchantId) {
      throw new Error('POS integration does not belong to merchant');
    }

    // Decrypt access token
    const decryptedAccessToken = decrypt(integration.accessToken);

    // Get provider and fetch locations
    const provider = getPOSProvider(integration.provider);
    const locations = await provider.fetchLocations(decryptedAccessToken);

    // Sync locations to database
    await prisma.$transaction(async (tx) => {
      for (const location of locations) {
        await tx.location.upsert({
          where: {
            posIntegrationId_posLocationId: {
              posIntegrationId,
              posLocationId: location.id,
            },
          },
          create: {
            merchantId,
            posIntegrationId,
            posLocationId: location.id,
            name: location.name,
            address: location.address,
            city: location.city,
            state: location.state,
            zipCode: location.zipCode,
            country: location.country,
          },
          update: {
            name: location.name,
            address: location.address,
            city: location.city,
            state: location.state,
            zipCode: location.zipCode,
            country: location.country,
          },
        });
      }
    });

    logger.info(
      { merchantId, posIntegrationId, count: locations.length },
      'Locations synced from POS'
    );
  } catch (error) {
    logger.error({ error, merchantId, posIntegrationId }, 'Failed to sync locations');
    throw error;
  }
}

/**
 * Create reward
 * @param merchantId - Merchant ID
 * @param rewardData - Reward data
 */
export async function createReward(
  merchantId: string,
  rewardData: {
    name: string;
    description?: string;
    type: RewardType;
    pointsCost?: number;
    itemName?: string;
    itemCount?: number;
  }
) {
  try {
    const reward = await prisma.reward.create({
      data: {
        merchantId,
        name: rewardData.name,
        description: rewardData.description,
        type: rewardData.type,
        pointsCost: rewardData.pointsCost,
        itemName: rewardData.itemName,
        itemCount: rewardData.itemCount,
      },
      include: {
        merchant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    logger.info({ rewardId: reward.id, merchantId }, 'Reward created');
    return reward;
  } catch (error) {
    logger.error({ error, merchantId }, 'Failed to create reward');
    throw error;
  }
}

/**
 * Get merchant rewards
 * @param merchantId - Merchant ID
 * @param includeInactive - Include inactive rewards
 */
export async function getMerchantRewards(
  merchantId: string,
  includeInactive: boolean = false
) {
  try {
    const rewards = await prisma.reward.findMany({
      where: {
        merchantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        posRewardItems: {
          select: {
            id: true,
            posProvider: true,
            posItemId: true,
          },
        },
      },
    });

    return rewards;
  } catch (error) {
    logger.error({ error, merchantId }, 'Failed to get merchant rewards');
    throw error;
  }
}

/**
 * Update reward
 * @param rewardId - Reward ID
 * @param merchantId - Merchant ID (for authorization)
 * @param rewardData - Reward data to update
 */
export async function updateReward(
  rewardId: string,
  merchantId: string,
  rewardData: {
    name?: string;
    description?: string;
    pointsCost?: number;
    itemName?: string;
    itemCount?: number;
    isActive?: boolean;
  }
) {
  try {
    const reward = await prisma.reward.findUnique({
      where: { id: rewardId },
    });

    if (!reward) {
      throw new Error('Reward not found');
    }

    if (reward.merchantId !== merchantId) {
      throw new Error('Reward does not belong to merchant');
    }

    const updated = await prisma.reward.update({
      where: { id: rewardId },
      data: rewardData,
    });

    logger.info({ rewardId, merchantId }, 'Reward updated');
    return updated;
  } catch (error) {
    logger.error({ error, rewardId, merchantId }, 'Failed to update reward');
    throw error;
  }
}

/**
 * Sync reward to POS catalog
 * @param rewardId - Reward ID
 * @param merchantId - Merchant ID (for authorization)
 */
export async function syncRewardToPOS(
  rewardId: string,
  merchantId: string
): Promise<void> {
  try {
    logger.info({ rewardId, merchantId }, 'Syncing reward to POS catalog');

    const reward = await prisma.reward.findUnique({
      where: { id: rewardId },
      include: {
        merchant: {
          include: {
            posIntegrations: {
              where: {
                provider: POSProvider.SQUARE, // For now, only Square
              },
            },
          },
        },
      },
    });

    if (!reward) {
      throw new Error('Reward not found');
    }

    if (reward.merchantId !== merchantId) {
      throw new Error('Reward does not belong to merchant');
    }

    const integration = reward.merchant.posIntegrations[0];
    if (!integration) {
      throw new Error('No POS integration found for merchant');
    }

    // Decrypt access token
    const decryptedAccessToken = decrypt(integration.accessToken);

    // Get provider and create catalog item
    const provider = getPOSProvider(integration.provider);
    if (!provider.createRewardItem) {
      throw new Error('POS provider does not support catalog operations');
    }

    const result = await provider.createRewardItem(decryptedAccessToken, {
      name: reward.name,
      description: reward.description || undefined,
      price: reward.pointsCost ? reward.pointsCost / 100 : undefined, // Convert points to dollars (example)
      metadata: {
        rewardId: reward.id,
        type: reward.type,
      },
    });

    // Store POS item ID
    await prisma.pOSRewardItem.upsert({
      where: {
        rewardId_posProvider: {
          rewardId,
          posProvider: integration.provider,
        },
      },
      create: {
        rewardId,
        posProvider: integration.provider,
        posItemId: result.id,
      },
      update: {
        posItemId: result.id,
      },
    });

    logger.info({ rewardId, posItemId: result.id }, 'Reward synced to POS catalog');
  } catch (error) {
    logger.error({ error, rewardId, merchantId }, 'Failed to sync reward to POS');
    throw error;
  }
}
