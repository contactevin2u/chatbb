import { Router } from 'express';
import { orderOpsController } from './orderops.controller';
import { authMiddleware } from '../auth/auth.middleware';
import { requirePermission } from '../auth/guards/rbac.guard';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Test connection
router.get('/test', orderOpsController.testConnection.bind(orderOpsController));

// Parse message (standalone)
router.post('/parse', orderOpsController.parseMessage.bind(orderOpsController));

// Conversation-specific routes
router.post(
  '/conversations/:conversationId/parse-create',
  requirePermission('conversations:view'),
  orderOpsController.parseAndCreateOrder.bind(orderOpsController)
);

router.post(
  '/conversations/:conversationId/link',
  requirePermission('conversations:view'),
  orderOpsController.linkOrder.bind(orderOpsController)
);

router.delete(
  '/conversations/:conversationId/link/:orderId',
  requirePermission('conversations:view'),
  orderOpsController.unlinkOrder.bind(orderOpsController)
);

router.get(
  '/conversations/:conversationId/orders',
  requirePermission('conversations:view'),
  orderOpsController.getLinkedOrders.bind(orderOpsController)
);

router.get(
  '/conversations/:conversationId/search-orders',
  requirePermission('conversations:view'),
  orderOpsController.searchOrdersByContact.bind(orderOpsController)
);

// Order lookup
router.get('/orders/:orderId', orderOpsController.getOrder.bind(orderOpsController));

// Search orders by code
router.get('/search', orderOpsController.searchOrders.bind(orderOpsController));

export default router;
