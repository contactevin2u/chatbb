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
  private token: string | null = null;
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

    // Add interceptor to attach auth token
    this.client.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  private async getToken(): Promise<string | null> {
    // Return cached token if still valid (with 5 min buffer)
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.token;
    }

    try {
      const response = await axios.post(`${this.config.baseUrl}/auth/login`, {
        username: this.config.username,
        password: this.config.password,
      });

      this.token = response.data.access_token;
      // Set expiry to 55 minutes (assuming 1 hour token validity)
      this.tokenExpiry = new Date(Date.now() + 55 * 60 * 1000);

      logger.info('OrderOps authentication successful');
      return this.token;
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
      return response.data;
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
