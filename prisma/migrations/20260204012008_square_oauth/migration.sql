-- AlterTable
ALTER TABLE "Business" ADD COLUMN "squareEnvironment" TEXT,
ADD COLUMN "squareMerchantId" TEXT,
ADD COLUMN "squareLocationId" TEXT,
ADD COLUMN "squareAccessToken" TEXT,
ADD COLUMN "squareRefreshToken" TEXT,
ADD COLUMN "squareTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "squareConnectedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Business_squareMerchantId_key" ON "Business"("squareMerchantId");
