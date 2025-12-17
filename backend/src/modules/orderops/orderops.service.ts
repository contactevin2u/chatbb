import axios, { AxiosInstance } from 'axios';
import { logger } from '../../shared/utils/logger';

interface OrderOpsConfig {
  baseUrl: string;
  username: string;
  password: string;
}

interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
}

interface OrderDetails {
  order_id: number;
  order_code: string;
  status: string;
  type: string;
  delivery_date?: string;
  customer_name: string;
  customer_phone: string;
  customer_address?: string;
  total: number;
  paid_amount: number;
  balance: number;
  outstanding: number;
  trip_status?: string;
  delivered_at?: string;
  pod_photo_urls?: string[];
  signature_url?: string;
  notes?: string;
  items: Array<{
    item_id: number;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
  payments: Array<{
    payment_id: number;
    amount: number;
    method: string;
    paid_at: string;
  }>;
}

interface OrderDue {
  order_id: number;
  order_code: string;
  total: number;
  paid: number;
  due: number;
  status: string;
}

class OrderOpsService {
  private client: AxiosInstance;
  private cookieToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private config: OrderOpsConfig;

  constructor() {
    this.config = {
      baseUrl: process.env.ORDEROPS_API_URL || 'https://orderops-api-v1.onrender.com',
      username: process.env.ORDEROPS_USERNAME || 'admin',
      password: process.env.ORDEROPS_PASSWORD || '',
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add interceptor to attach auth cookie
    this.client.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      if (token) {
        config.headers.Cookie = `token=${token}`;
      }
      return config;
    });
  }

  private async getToken(): Promise<string | null> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.cookieToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.cookieToken;
    }

    try {
      const response = await axios.post(`${this.config.baseUrl}/auth/login`, {
        username: this.config.username,
        password: this.config.password,
      });

      // Extract token from set-cookie header
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const tokenCookie = cookies.find((c: string) => c.includes('token='));
        if (tokenCookie) {
          this.cookieToken = tokenCookie.split('token=')[1].split(';')[0];
          // Set expiry to 23 hours (cookie is valid for 24 hours)
          this.tokenExpiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
          logger.info('OrderOps authentication successful');
          return this.cookieToken;
        }
      }

      logger.error('OrderOps login did not return token cookie');
      return null;
    } catch (error: any) {
      logger.error({ error: error.message }, 'OrderOps authentication failed');
      return null;
    }
  }

  /**
   * Parse a WhatsApp message using the advanced 4-stage LLM pipeline
   */
  async parseMessage(text: string): Promise<ParseResult> {
    try {
      const response = await this.client.post('/parse/advanced', { text });
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'OrderOps parse failed');
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Create a simple order from parsed data
   */
  async createSimpleOrder(orderData: {
    customer_name: string;
    customer_phone?: string;
    delivery_address: string;
    notes?: string;
    total_amount: number;
    delivery_date?: string;
  }): Promise<ParseResult> {
    try {
      const response = await this.client.post('/orders/simple', orderData);
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'OrderOps create order failed');
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get order details by ID
   */
  async getOrder(orderId: number): Promise<OrderDetails | null> {
    try {
      const response = await this.client.get(`/orders/${orderId}`);
      const raw = response.data?.data || response.data;

      if (!raw) return null;

      // Transform API response to match our interface
      return {
        order_id: raw.id,
        order_code: raw.code,
        status: raw.status,
        type: raw.type,
        delivery_date: raw.delivery_date,
        customer_name: raw.customer?.name || '',
        customer_phone: raw.customer?.phone || '',
        customer_address: raw.customer?.address,
        total: parseFloat(raw.total) || 0,
        paid_amount: parseFloat(raw.paid_amount) || 0,
        balance: parseFloat(raw.balance) || 0,
        outstanding: parseFloat(raw.balance) || 0,
        trip_status: raw.trip?.status,
        delivered_at: raw.trip?.delivered_at || raw.trip_delivered_at,
        pod_photo_urls: raw.trip?.pod_photo_urls || [],
        signature_url: raw.trip?.signature_url,
        notes: raw.notes,
        items: (raw.items || []).map((item: any) => ({
          item_id: item.id,
          product_name: item.name,
          quantity: parseInt(item.qty) || 0,
          unit_price: parseFloat(item.unit_price) || 0,
          subtotal: parseFloat(item.line_total) || 0,
        })),
        payments: (raw.payments || []).map((payment: any) => ({
          payment_id: payment.id,
          amount: parseFloat(payment.amount) || 0,
          method: payment.method || payment.payment_method,
          paid_at: payment.paid_at || payment.created_at,
        })),
      };
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'OrderOps get order failed');
      return null;
    }
  }

  /**
   * Get order due/outstanding balance
   */
  async getOrderDue(orderId: number): Promise<OrderDue | null> {
    try {
      const response = await this.client.get(`/orders/${orderId}/due`);
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'OrderOps get order due failed');
      return null;
    }
  }

  /**
   * List orders with optional filters
   */
  async listOrders(filters?: {
    status?: string;
    type?: string;
    customer_phone?: string;
    limit?: number;
    offset?: number;
  }): Promise<OrderDetails[]> {
    try {
      const response = await this.client.get('/orders', { params: filters });
      return response.data.orders || response.data || [];
    } catch (error: any) {
      logger.error({ error: error.message }, 'OrderOps list orders failed');
      return [];
    }
  }

  /**
   * Search orders by customer phone
   */
  async searchByPhone(phone: string): Promise<OrderDetails[]> {
    return this.listOrders({ customer_phone: phone, limit: 10 });
  }

  /**
   * Queue a parsing job for async processing
   */
  async queueParseJob(text: string): Promise<ParseResult> {
    try {
      const response = await this.client.post('/queue/parse-create', { text });
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'OrderOps queue job failed');
      return {
        success: false,
        error: error.response?.data?.detail || error.message,
      };
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<any> {
    try {
      const response = await this.client.get(`/jobs/${jobId}`);
      return response.data;
    } catch (error: any) {
      logger.error({ error: error.message, jobId }, 'OrderOps get job status failed');
      return null;
    }
  }

  /**
   * Test connection to OrderOps API
   */
  async testConnection(): Promise<boolean> {
    try {
      const token = await this.getToken();
      return !!token;
    } catch {
      return false;
    }
  }
}

export const orderOpsService = new OrderOpsService();
