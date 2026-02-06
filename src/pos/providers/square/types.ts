/**
 * Square-specific types
 */

export interface SquareOAuthResponse {
  access_token: string;
  token_type: string;
  expires_at?: string;
  merchant_id: string;
  refresh_token?: string;
}

export interface SquareWebhookEvent {
  merchant_id: string;
  type: string;
  event_id: string;
  created_at: string;
  data: {
    type: string;
    id: string;
    object: {
      [key: string]: any;
    };
  };
}

export interface SquareLocation {
  id: string;
  name: string;
  address?: {
    address_line_1?: string;
    locality?: string;
    administrative_district_level_1?: string;
    postal_code?: string;
    country?: string;
  };
}

export interface SquareTransaction {
  id: string;
  location_id: string;
  created_at: string;
  tenders?: Array<{
    amount_money: {
      amount: number;
      currency: string;
    };
  }>;
  line_items?: Array<{
    uid?: string;
    name?: string;
    quantity?: string;
    base_price_money?: {
      amount: number;
      currency: string;
    };
    catalog_object_id?: string;
    catalog_version?: number;
    variation_name?: string;
  }>;
}

export interface SquareCatalogObject {
  type: string;
  id: string;
  updated_at?: string;
  version?: number;
  is_deleted?: boolean;
  catalog_v1_ids?: Array<{
    catalog_v1_id?: string;
    location_id?: string;
  }>;
  item_data?: {
    name?: string;
    description?: string;
    variations?: Array<{
      type: string;
      id: string;
      item_variation_data?: {
        name?: string;
        price_money?: {
          amount: number;
          currency: string;
        };
      };
    }>;
  };
}
