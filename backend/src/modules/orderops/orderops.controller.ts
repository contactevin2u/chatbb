import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../core/database/prisma';
import { orderOpsService } from './orderops.service';
import { logger } from '../../shared/utils/logger';

export class OrderOpsController {
  /**
   * Parse a message using OrderOps advanced LLM parser
   * POST /api/orderops/parse
   */
  async parseMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { text, conversationId } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Message text is required' });
      }

      const result = await orderOpsService.parseMessage(text);

      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Parse failed' });
      }

      res.json({
        success: true,
        parsed: result.data,
        conversationId,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Parse and create order from conversation message
   * POST /api/orderops/conversations/:conversationId/parse-create
   * Automatically links the order to the conversation if created
   */
  async parseAndCreateOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { conversationId } = req.params;
      const { text, messageId, autoLink = true } = req.body;
      const organizationId = req.organizationId!;
      const userId = req.user?.sub;

      // Verify conversation belongs to org
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId },
        include: { contact: true },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Get message text if messageId provided
      let messageText = text;
      if (messageId && !text) {
        const message = await prisma.message.findFirst({
          where: { id: messageId, conversationId },
        });
        if (message && message.content) {
          const content = message.content as any;
          messageText = content.text || content.body || '';
        }
      }

      if (!messageText) {
        return res.status(400).json({ error: 'Message text is required' });
      }

      // Parse the message
      const parseResult = await orderOpsService.parseMessage(messageText);

      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Failed to parse message',
          details: parseResult.error,
        });
      }

      // Auto-link if order was created
      let linked = false;
      let linkedOrder = null;
      const orderData = parseResult.data?.data;

      if (autoLink && orderData?.order_id) {
        try {
          // Add to ConversationOrder table (supports multiple orders)
          await prisma.conversationOrder.upsert({
            where: {
              conversationId_orderId: {
                conversationId,
                orderId: orderData.order_id,
              },
            },
            update: {
              linkedAt: new Date(),
              linkedBy: userId,
            },
            create: {
              conversationId,
              orderId: orderData.order_id,
              orderCode: orderData.order_code,
              linkedBy: userId,
            },
          });

          // Also update legacy single order field for backwards compatibility
          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              orderOpsOrderId: orderData.order_id,
              orderOpsOrderCode: orderData.order_code,
              orderOpsLinkedAt: new Date(),
            },
          });

          linked = true;
          linkedOrder = await orderOpsService.getOrder(orderData.order_id);
          logger.info({ conversationId, orderId: orderData.order_id }, 'Order auto-linked to conversation');
        } catch (linkError: any) {
          logger.error({ error: linkError.message, conversationId }, 'Failed to auto-link order');
        }
      }

      res.json({
        success: true,
        parsed: parseResult.data,
        linked,
        linkedOrder,
        conversationId,
        contact: {
          name: conversation.contact.displayName || `${conversation.contact.firstName || ''} ${conversation.contact.lastName || ''}`.trim() || conversation.contact.identifier,
          phone: conversation.contact.identifier,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Link an existing OrderOps order to a conversation
   * POST /api/orderops/conversations/:conversationId/link
   */
  async linkOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { conversationId } = req.params;
      const { orderId, orderCode } = req.body;
      const organizationId = req.organizationId!;
      const userId = req.user?.sub;

      if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      // Verify conversation belongs to org
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Verify order exists in OrderOps
      const order = await orderOpsService.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found in OrderOps' });
      }

      // Add to ConversationOrder table (supports multiple orders)
      await prisma.conversationOrder.upsert({
        where: {
          conversationId_orderId: {
            conversationId,
            orderId: order.order_id,
          },
        },
        update: {
          linkedAt: new Date(),
          linkedBy: userId,
        },
        create: {
          conversationId,
          orderId: order.order_id,
          orderCode: order.order_code,
          linkedBy: userId,
        },
      });

      // Also update legacy single order field
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          orderOpsOrderId: order.order_id,
          orderOpsOrderCode: order.order_code,
          orderOpsLinkedAt: new Date(),
        },
      });

      logger.info({ conversationId, orderId: order.order_id }, 'Order linked to conversation');

      res.json({
        success: true,
        order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unlink a specific order from conversation
   * DELETE /api/orderops/conversations/:conversationId/link/:orderId
   */
  async unlinkOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { conversationId, orderId } = req.params;
      const organizationId = req.organizationId!;

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Remove from ConversationOrder table
      if (orderId) {
        await prisma.conversationOrder.deleteMany({
          where: {
            conversationId,
            orderId: parseInt(orderId),
          },
        });
      }

      // Check if any orders remain linked
      const remainingOrders = await prisma.conversationOrder.findFirst({
        where: { conversationId },
        orderBy: { linkedAt: 'desc' },
      });

      // Update legacy field to most recent order or null
      if (remainingOrders) {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            orderOpsOrderId: remainingOrders.orderId,
            orderOpsOrderCode: remainingOrders.orderCode,
            orderOpsLinkedAt: remainingOrders.linkedAt,
          },
        });
      } else {
        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            orderOpsOrderId: null,
            orderOpsOrderCode: null,
            orderOpsLinkedAt: null,
          },
        });
      }

      logger.info({ conversationId, orderId }, 'Order unlinked from conversation');

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all linked orders for a conversation
   * GET /api/orderops/conversations/:conversationId/orders
   */
  async getLinkedOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { conversationId } = req.params;
      const organizationId = req.organizationId!;

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId },
        include: { linkedOrders: { orderBy: { linkedAt: 'desc' } } },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      if (!conversation.linkedOrders.length) {
        return res.json({ linked: false, orders: [] });
      }

      // Fetch fresh details for all linked orders
      const ordersWithDetails = await Promise.all(
        conversation.linkedOrders.map(async (link) => {
          const order = await orderOpsService.getOrder(link.orderId);
          const due = await orderOpsService.getOrderDue(link.orderId);
          return {
            ...link,
            order,
            due,
          };
        })
      );

      res.json({
        linked: true,
        orders: ordersWithDetails,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search orders by code
   * GET /api/orderops/search
   */
  async searchOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { q } = req.query;

      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }

      const orders = await orderOpsService.searchByCode(q);

      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search orders by customer phone (from contact)
   * GET /api/orderops/conversations/:conversationId/search-orders
   */
  async searchOrdersByContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { conversationId } = req.params;
      const organizationId = req.organizationId!;

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId },
        include: { contact: true },
      });

      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const phone = conversation.contact.identifier;
      if (!phone) {
        return res.json({ orders: [] });
      }

      // Search by phone in OrderOps (identifier is the phone number for WhatsApp contacts)
      const orders = await orderOpsService.searchByPhone(phone);

      res.json({ orders });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order details by ID
   * GET /api/orderops/orders/:orderId
   */
  async getOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const { orderId } = req.params;

      const order = await orderOpsService.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const due = await orderOpsService.getOrderDue(parseInt(orderId));

      res.json({ order, due });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test OrderOps connection
   * GET /api/orderops/test
   */
  async testConnection(req: Request, res: Response, next: NextFunction) {
    try {
      const connected = await orderOpsService.testConnection();
      res.json({
        connected,
        message: connected ? 'OrderOps connection successful' : 'OrderOps connection failed',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const orderOpsController = new OrderOpsController();
