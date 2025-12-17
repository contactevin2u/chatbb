import api from './client';

export interface OrderItem {
  item_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  item_type?: string;
  returned?: boolean;
}

export interface Payment {
  payment_id: number;
  amount: number;
  method: string;
  paid_at: string;
  category?: string;
}

export interface OrderDetails {
  order_id: number;
  order_code: string;
  status: string;
  type: string;
  delivery_date?: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  customer_map_url?: string;
  total: number;
  paid_amount: number;
  balance: number;
  outstanding: number;
  // Trip/Driver info
  trip_id?: number;
  trip_status?: string;
  driver_id?: number;
  driver_name?: string;
  planned_at?: string;
  delivered_at?: string;
  pod_photo_urls?: string[];
  signature_url?: string;
  notes?: string;
  items: OrderItem[];
  payments: Payment[];
}

export interface OrderDue {
  expected: number;
  paid: number;
  balance: number;
  to_collect: number;
  to_refund: number;
  accrued: number;
  monthly_amount: number;
  months_elapsed: number;
  is_delivered: boolean;
  start_date?: string;
  cutoff_date?: string;
}

export interface ParseResult {
  success: boolean;
  parsed?: any;
  conversationId?: string;
  contact?: {
    name: string;
    phone: string;
  };
  error?: string;
}

export interface LinkedOrderResponse {
  linked: boolean;
  linkedAt?: string;
  order?: OrderDetails;
  due?: OrderDue;
}

// Test OrderOps connection
export async function testOrderOpsConnection(): Promise<{ connected: boolean; message: string }> {
  const response = await api.get('/orderops/test');
  return response.data;
}

// Parse a message using OrderOps advanced LLM parser
export async function parseMessage(text: string): Promise<ParseResult> {
  const response = await api.post('/orderops/parse', { text });
  return response.data;
}

// Parse a message from a conversation
export async function parseConversationMessage(
  conversationId: string,
  data: { text?: string; messageId?: string }
): Promise<ParseResult> {
  const response = await api.post(`/orderops/conversations/${conversationId}/parse-create`, data);
  return response.data;
}

// Link an order to a conversation
export async function linkOrder(
  conversationId: string,
  orderId: number,
  orderCode?: string
): Promise<{ success: boolean; conversation: any; order: OrderDetails }> {
  const response = await api.post(`/orderops/conversations/${conversationId}/link`, {
    orderId,
    orderCode,
  });
  return response.data;
}

// Unlink order from conversation
export async function unlinkOrder(conversationId: string): Promise<{ success: boolean }> {
  const response = await api.delete(`/orderops/conversations/${conversationId}/link`);
  return response.data;
}

// Get linked order for a conversation
export async function getLinkedOrder(conversationId: string): Promise<LinkedOrderResponse> {
  const response = await api.get(`/orderops/conversations/${conversationId}/order`);
  return response.data;
}

// Search orders by contact phone
export async function searchOrdersByContact(conversationId: string): Promise<{ orders: OrderDetails[] }> {
  const response = await api.get(`/orderops/conversations/${conversationId}/search-orders`);
  return response.data;
}

// Get order by ID
export async function getOrder(orderId: number): Promise<{ order: OrderDetails; due: OrderDue }> {
  const response = await api.get(`/orderops/orders/${orderId}`);
  return response.data;
}
