/**
 * Square API client wrapper with dependency injection for testing.
 * Sandbox-only implementation for Phase 2.
 */

const SANDBOX_BASE_URL = 'https://connect.squareupsandbox.com';

/**
 * Create a Square client instance.
 * @param {Object} options - Configuration options
 * @param {Object} options.config - Config object with Square credentials
 * @param {Function} options.fetchImpl - Fetch implementation (default: global fetch)
 * @returns {Object} Square client with methods
 */
export function makeSquareClient({ config, fetchImpl = fetch }) {
  if (!config) {
    throw new Error('config is required');
  }

  /**
   * Exchange OAuth authorization code for access token.
   * @param {Object} params
   * @param {string} params.code - Authorization code from Square
   * @returns {Promise<Object>} Token response with access_token, refresh_token, merchant_id, expires_at
   */
  async function exchangeCodeForToken({ code }) {
    const url = `${SANDBOX_BASE_URL}/oauth2/token`;
    
    const body = new URLSearchParams({
      client_id: config.SQUARE_APP_ID,
      client_secret: config.SQUARE_APP_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.SQUARE_OAUTH_REDIRECT_URL,
    });

    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Square token exchange failed: ${response.status} ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Get merchant information and locations.
   * @param {Object} params
   * @param {string} params.accessToken - Square access token
   * @returns {Promise<Object>} Object with merchant and locations
   */
  async function getMerchantAndLocations({ accessToken }) {
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Square-Version': '2024-01-18',
    };

    // Fetch merchant
    const merchantUrl = `${SANDBOX_BASE_URL}/v2/merchants/me`;
    const merchantResponse = await fetchImpl(merchantUrl, {
      method: 'GET',
      headers,
    });

    if (!merchantResponse.ok) {
      const errorText = await merchantResponse.text();
      throw new Error(`Square merchant fetch failed: ${merchantResponse.status} ${errorText}`);
    }

    const merchantData = await merchantResponse.json();
    const merchant = merchantData.merchant;

    // Fetch locations
    const locationsUrl = `${SANDBOX_BASE_URL}/v2/locations`;
    const locationsResponse = await fetchImpl(locationsUrl, {
      method: 'GET',
      headers,
    });

    if (!locationsResponse.ok) {
      const errorText = await locationsResponse.text();
      throw new Error(`Square locations fetch failed: ${locationsResponse.status} ${errorText}`);
    }

    const locationsData = await locationsResponse.json();
    const locations = locationsData.locations || [];

    return {
      merchant,
      locations,
    };
  }

  return {
    exchangeCodeForToken,
    getMerchantAndLocations,
  };
}
