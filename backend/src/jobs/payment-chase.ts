/**
 * Payment Chase Job
 *
 * Hourly job to send payment reminders to customers with overdue orders.
 * - Only runs between 9am-9pm Malaysia time
 * - Sends reminders for orders >30 days past due
 * - Respects 15-day cooldown between reminders
 * - Sends messages in Malay with order details
 */

import { connectDatabase, disconnectDatabase, prisma } from '../core/database/prisma';
import { logger } from '../shared/utils/logger';
import { Decimal } from '@prisma/client/runtime/library';
import Redis from 'ioredis';

// Malaysia timezone offset (UTC+8)
const MALAYSIA_OFFSET = 8 * 60 * 60 * 1000;

// Configuration
const CONFIG = {
  minDaysPastDue: 30,        // Only chase orders >30 days overdue
  reminderCooldownDays: 15,   // Wait 15 days between reminders
  sendHourStart: 9,           // Start sending at 9am
  sendHourEnd: 21,            // Stop sending at 9pm
  batchSize: 50,              // Process 50 orders per run
};

// Company details for message
const COMPANY = {
  name: 'AA Alive Sdn Bhd',
  tagline: 'Dari Yaya Katil Hospital Prihatin',
  bank: 'CIMB',
  accountNumber: '8011366127',
  accountName: 'AA Alive Sdn Bhd',
};

interface OverdueOrder {
  orderId: number;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  total: number;
  paidAmount: number;
  balance: number;
  deliveredAt: string;
  daysPastDue: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
}

/**
 * Get current Malaysia time
 */
function getMalaysiaTime(): Date {
  const now = new Date();
  return new Date(now.getTime() + MALAYSIA_OFFSET - (now.getTimezoneOffset() * 60 * 1000));
}

/**
 * Check if current time is within sending hours (9am-9pm Malaysia)
 */
function isWithinSendingHours(): boolean {
  const malaysiaTime = getMalaysiaTime();
  const hour = malaysiaTime.getHours();
  return hour >= CONFIG.sendHourStart && hour < CONFIG.sendHourEnd;
}

/**
 * Format currency in Malaysian Ringgit
 */
function formatRM(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

/**
 * Generate Malay payment reminder message
 */
function generateReminderMessage(order: OverdueOrder, reminderSequence: number): string {
  const itemsList = order.items
    .map(item => `  • ${item.name} x${item.quantity} - ${formatRM(item.unitPrice * item.quantity)}`)
    .join('\n');

  const sequenceText = reminderSequence === 1
    ? 'pertama'
    : reminderSequence === 2
      ? 'kedua'
      : `ke-${reminderSequence}`;

  return `Assalamualaikum & Salam Sejahtera,

Maaf mengganggu. Ini adalah peringatan ${sequenceText} dari *${COMPANY.name}* - ${COMPANY.tagline}.

📋 *Maklumat Pesanan:*
Order: #${order.orderCode}
Nama: ${order.customerName}

📦 *Item:*
${itemsList}

💰 *Butiran Bayaran:*
Jumlah: ${formatRM(order.total)}
Telah Dibayar: ${formatRM(order.paidAmount)}
*Baki Tertunggak: ${formatRM(order.balance)}*

⏰ Pesanan ini telah *${order.daysPastDue} hari* melepasi tarikh pembayaran.

🏦 *Maklumat Pembayaran:*
Bank: ${COMPANY.bank}
No. Akaun: ${COMPANY.accountNumber}
Nama: ${COMPANY.accountName}

Sila buat pembayaran secepat mungkin dan hantar bukti pembayaran kepada kami.

Maaf mengganggu jika pembayaran telah dibuat. Sila abaikan mesej ini.

Terima kasih atas kerjasama anda. 🙏

_Mesej automatik dari ${COMPANY.name}_`;
}

/**
 * Fetch overdue orders from OrderOps API
 */
async function fetchOverdueOrders(): Promise<OverdueOrder[]> {
  const orderOpsUrl = process.env.ORDEROPS_API_URL;
  const orderOpsEmail = process.env.ORDEROPS_EMAIL;
  const orderOpsPassword = process.env.ORDEROPS_PASSWORD;

  if (!orderOpsUrl || !orderOpsEmail || !orderOpsPassword) {
    logger.error('OrderOps credentials not configured');
    return [];
  }

  try {
    // Login to get token
    const loginResponse = await fetch(`${orderOpsUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: orderOpsEmail, password: orderOpsPassword }),
    });

    if (!loginResponse.ok) {
      logger.error('Failed to login to OrderOps');
      return [];
    }

    const loginData = await loginResponse.json() as any;
    const token = loginData.data?.token || loginData.token;

    if (!token) {
      logger.error('No token received from OrderOps');
      return [];
    }

    // Fetch orders with DELIVERED status
    const ordersResponse = await fetch(
      `${orderOpsUrl}/orders?status=DELIVERED&limit=200`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!ordersResponse.ok) {
      logger.error('Failed to fetch orders from OrderOps');
      return [];
    }

    const ordersData = await ordersResponse.json() as any;
    const orders = ordersData.data?.items || ordersData.items || [];

    // Filter and transform overdue orders
    const now = new Date();
    const overdueOrders: OverdueOrder[] = [];

    for (const order of orders) {
      const balance = parseFloat(order.balance) || 0;
      if (balance <= 0) continue; // Skip paid orders

      const deliveredAt = order.trip?.delivered_at || order.trip_delivered_at;
      if (!deliveredAt) continue; // Skip orders without delivery date

      const deliveredDate = new Date(deliveredAt);
      const daysPastDue = Math.floor((now.getTime() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysPastDue < CONFIG.minDaysPastDue) continue; // Skip recent orders

      overdueOrders.push({
        orderId: order.id,
        orderCode: order.code,
        customerName: order.customer?.name || order.customer_name || 'Pelanggan',
        customerPhone: order.customer?.phone || '',
        total: parseFloat(order.total) || 0,
        paidAmount: parseFloat(order.paid_amount) || 0,
        balance,
        deliveredAt,
        daysPastDue,
        items: (order.items || []).map((item: any) => ({
          name: item.name,
          quantity: parseInt(item.qty) || 1,
          unitPrice: parseFloat(item.unit_price) || 0,
        })),
      });
    }

    logger.info({ count: overdueOrders.length }, 'Found overdue orders');
    return overdueOrders.slice(0, CONFIG.batchSize);
  } catch (error) {
    logger.error({ error }, 'Error fetching overdue orders');
    return [];
  }
}

/**
 * Find conversation by customer phone
 */
async function findConversationByPhone(phone: string, organizationId: string) {
  // Normalize phone number
  const normalizedPhone = phone.replace(/\D/g, '');

  // Try different formats
  const phoneVariants = [
    normalizedPhone,
    `60${normalizedPhone.replace(/^60/, '')}`, // Ensure 60 prefix
    normalizedPhone.replace(/^60/, ''),         // Without 60 prefix
  ];

  for (const phoneVariant of phoneVariants) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        organizationId,
        contact: {
          identifier: { contains: phoneVariant },
        },
      },
      include: {
        channel: true,
        contact: true,
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    if (conversation) {
      return conversation;
    }
  }

  return null;
}

/**
 * Check if reminder can be sent (respects cooldown)
 */
async function canSendReminder(orderId: number): Promise<{ canSend: boolean; sequence: number }> {
  const now = new Date();

  const lastReminder = await prisma.paymentReminder.findFirst({
    where: { orderId },
    orderBy: { sentAt: 'desc' },
  });

  if (!lastReminder) {
    return { canSend: true, sequence: 1 };
  }

  // Check if cooldown has passed
  if (lastReminder.nextReminderAt > now) {
    return { canSend: false, sequence: lastReminder.reminderSequence };
  }

  return { canSend: true, sequence: lastReminder.reminderSequence + 1 };
}

/**
 * Send WhatsApp message via Redis command
 */
async function sendWhatsAppMessage(
  channelId: string,
  to: string,
  text: string
): Promise<string | null> {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.error('REDIS_URL not configured');
    return null;
  }

  const redis = new Redis(redisUrl);
  const requestId = `payment-chase-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    // Create a response subscriber
    const subscriber = new Redis(redisUrl);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        subscriber.disconnect();
        redis.disconnect();
        resolve(null);
      }, 30000); // 30 second timeout

      subscriber.subscribe(`whatsapp:response:${requestId}`, (err) => {
        if (err) {
          logger.error({ error: err }, 'Failed to subscribe for response');
          clearTimeout(timeout);
          subscriber.disconnect();
          redis.disconnect();
          resolve(null);
        }
      });

      subscriber.on('message', (channel, message) => {
        clearTimeout(timeout);
        subscriber.disconnect();
        redis.disconnect();

        try {
          const response = JSON.parse(message);
          if (response.success) {
            resolve(response.messageId);
          } else {
            logger.error({ error: response.error }, 'Message send failed');
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });

      // Send the command
      redis.publish(`whatsapp:command:${channelId}`, JSON.stringify({
        type: 'send',
        requestId,
        data: { to, text },
      }));
    });
  } catch (error) {
    logger.error({ error }, 'Error sending WhatsApp message');
    redis.disconnect();
    return null;
  }
}

/**
 * Main job function
 */
async function runPaymentChase() {
  logger.info('Starting payment chase job');

  // Check sending hours
  if (!isWithinSendingHours()) {
    const malaysiaTime = getMalaysiaTime();
    logger.info(
      { hour: malaysiaTime.getHours() },
      'Outside sending hours (9am-9pm Malaysia), skipping'
    );
    return;
  }

  // Get default organization (first one)
  const organization = await prisma.organization.findFirst({
    include: {
      channels: {
        where: { status: 'CONNECTED', type: 'WHATSAPP' },
        take: 1,
      },
    },
  });

  if (!organization) {
    logger.error('No organization found');
    return;
  }

  const channel = organization.channels[0];
  if (!channel) {
    logger.error('No connected WhatsApp channel found');
    return;
  }

  // Fetch overdue orders
  const overdueOrders = await fetchOverdueOrders();

  if (overdueOrders.length === 0) {
    logger.info('No overdue orders to process');
    return;
  }

  let sentCount = 0;
  let skippedCount = 0;

  for (const order of overdueOrders) {
    if (!order.customerPhone) {
      logger.warn({ orderCode: order.orderCode }, 'Order has no customer phone');
      skippedCount++;
      continue;
    }

    // Check cooldown
    const { canSend, sequence } = await canSendReminder(order.orderId);
    if (!canSend) {
      logger.debug({ orderCode: order.orderCode }, 'Reminder cooldown not passed');
      skippedCount++;
      continue;
    }

    // Find conversation
    const conversation = await findConversationByPhone(order.customerPhone, organization.id);
    if (!conversation) {
      logger.warn(
        { orderCode: order.orderCode, phone: order.customerPhone },
        'No conversation found for customer'
      );
      skippedCount++;
      continue;
    }

    // Generate message
    const message = generateReminderMessage(order, sequence);

    // Send message
    const recipient = conversation.contact?.identifier
      ? `${conversation.contact.identifier}@s.whatsapp.net`
      : null;

    if (!recipient) {
      logger.warn({ orderCode: order.orderCode }, 'No recipient identifier');
      skippedCount++;
      continue;
    }

    logger.info(
      { orderCode: order.orderCode, sequence, phone: order.customerPhone },
      'Sending payment reminder'
    );

    const messageId = await sendWhatsAppMessage(channel.id, recipient, message);

    if (messageId) {
      // Record the reminder
      const nextReminderAt = new Date();
      nextReminderAt.setDate(nextReminderAt.getDate() + CONFIG.reminderCooldownDays);

      await prisma.paymentReminder.create({
        data: {
          organizationId: organization.id,
          conversationId: conversation.id,
          orderId: order.orderId,
          orderCode: order.orderCode,
          customerPhone: order.customerPhone,
          amountDue: new Decimal(order.balance),
          daysPastDue: order.daysPastDue,
          messageId,
          nextReminderAt,
          reminderSequence: sequence,
        },
      });

      sentCount++;
      logger.info(
        { orderCode: order.orderCode, messageId, sequence },
        'Payment reminder sent'
      );
    } else {
      logger.error({ orderCode: order.orderCode }, 'Failed to send payment reminder');
    }

    // Small delay between messages to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  logger.info(
    { sent: sentCount, skipped: skippedCount, total: overdueOrders.length },
    'Payment chase job completed'
  );
}

async function main() {
  try {
    await connectDatabase();
    await runPaymentChase();
    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Payment chase job failed');
    process.exit(1);
  }
}

main();
