# Loyalty Rewards MVP Backend

A Fastify-based backend service for a loyalty rewards MVP with PostgreSQL (Prisma), Redis, append-only ledger for points, and redemption lifecycle with idempotency.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start Docker services:
```bash
docker-compose up -d
```

3. Run Prisma migrations:
```bash
npm run prisma:migrate
npm run prisma:generate
```

4. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

   Required environment variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `REDIS_URL` - Redis connection string
   - `PORT` - Server port (default: 3000)
   - `NODE_ENV` - Environment (development/production/test)
   
   For Phase 2 (Square OAuth), also configure:
   - `SQUARE_ENV` - Set to "sandbox" for sandbox environment
   - `SQUARE_APP_ID` - Your Square application ID
   - `SQUARE_APP_SECRET` - Your Square application secret
   - `SQUARE_OAUTH_REDIRECT_URL` - OAuth callback URL (e.g., `http://localhost:3000/square/oauth/callback`)
   - `SQUARE_OAUTH_SCOPES` - Space-separated OAuth scopes (e.g., `PAYMENTS_READ ORDERS_READ CUSTOMERS_READ MERCHANT_PROFILE_READ`)

5. Start the development server:
```bash
npm run dev
```

## Running Tests

```bash
npm test
```

## JSON Schema Documentation

### RewardProgram.earnParamsJson

The `earnParamsJson` field structure depends on the `earnType`:

#### POINTS_PER_DOLLAR
```json
{
  "version": 1,
  "pointsPerDollar": <int>,
  "rounding": "FLOOR",
  "minSubtotalCents": 0
}
```

- `version`: Must be `1`
- `pointsPerDollar`: Positive integer representing points earned per dollar spent
- `rounding`: Must be `"FLOOR"`
- `minSubtotalCents`: Non-negative integer (minimum subtotal in cents to earn points)

#### ITEM_POINTS
```json
{
  "version": 1,
  "items": [
    { "squareCatalogObjectId": "<string>", "points": <int> }
  ]
}
```

- `version`: Must be `1`
- `items`: Array of at least one item mapping
  - `squareCatalogObjectId`: String identifier for the Square catalog object
  - `points`: Positive integer representing points earned for this item

### Reward.configJson

The `configJson` field structure depends on the reward `type`:

#### FREE_ITEM
```json
{
  "version": 1,
  "displayName": "Free Coffee",
  "squareCatalogObjectId": "<string>",
  "squareDiscountName": "Reward: Free Coffee"
}
```

- `version`: Must be `1`
- `displayName`: String name shown to users
- `squareCatalogObjectId`: String identifier for the Square catalog object
- `squareDiscountName`: String name of the Square discount tile (required for merchant instructions)

#### PERCENT_OFF
```json
{
  "version": 1,
  "displayName": "20% Off",
  "percentOff": <int 1-100>,
  "appliesTo": "ORDER_SUBTOTAL",
  "squareDiscountName": "Reward: 20% Off"
}
```

- `version`: Must be `1`
- `displayName`: String name shown to users
- `percentOff`: Integer between 1 and 100 (percentage discount)
- `appliesTo`: Must be `"ORDER_SUBTOTAL"`
- `squareDiscountName`: String name of the Square discount tile (required for merchant instructions)

#### AMOUNT_OFF
```json
{
  "version": 1,
  "displayName": "$5 Off",
  "amountOffCents": <int >=1>,
  "appliesTo": "ORDER_SUBTOTAL",
  "squareDiscountName": "Reward: $5 Off"
}
```

- `version`: Must be `1`
- `displayName`: String name shown to users
- `amountOffCents`: Positive integer (discount amount in cents)
- `appliesTo`: Must be `"ORDER_SUBTOTAL"`
- `squareDiscountName`: String name of the Square discount tile (required for merchant instructions)

### LedgerEvent.metadataJson

The `metadataJson` field is flexible but commonly includes:

```json
{
  "version": 1,
  "source": "seed|manual|square_webhook",
  "redemptionId"?: "...",
  "external"?: {
    "paymentId"?: "...",
    "orderId"?: "..."
  }
}
```

- `version`: Optional, typically `1`
- `source`: String indicating the source of the event
- `redemptionId`: Optional string for redemption-related events
- `external`: Optional object containing external provider IDs

## API Endpoints

### Phase 0-1 Endpoints
- `GET /health` - Health check
- `POST /dev/seed` - Seed test data (idempotent)
- `GET /balance?userId=&businessId=` - Get user balance
- `POST /redeem/create` - Create a redemption token
- `POST /merchant/verify` - Verify and lock a redemption token
- `POST /redeem/confirm` - Confirm a redemption (deducts points)
- `POST /admin/cancel-expired` - Cancel expired redemptions

### Phase 2: Square OAuth Endpoints (Sandbox)
- `GET /square/oauth/start?businessId=<id>` - Initiates Square OAuth flow. Redirects to Square authorization page with state parameter stored in Redis (10-minute TTL).
- `GET /square/oauth/callback?code=<code>&state=<state>` - Handles Square OAuth callback. Exchanges authorization code for access token, fetches merchant and location data, and stores connection details on the Business record. Returns connection status and Square identifiers.
- `GET /merchant/status?businessId=<id>` - Returns Square connection status for a business. Returns `{connected: false}` if not connected, or `{connected: true, squareEnvironment, squareMerchantId, squareLocationId}` if connected.

**Note:** Phase 2 is sandbox-only. All Square API calls use `connect.squareupsandbox.com`.
