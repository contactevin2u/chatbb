'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  X,
  RefreshCw,
  Link2,
  Unlink,
  Truck,
  CreditCard,
  MapPin,
  Phone,
  User,
  Calendar,
  DollarSign,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import {
  getLinkedOrders,
  searchOrdersByContact,
  linkOrder,
  unlinkOrder,
  type OrderDetails,
  type OrderDue,
} from '@/lib/api/orderops';

interface OrderPanelProps {
  conversationId: string;
  onClose: () => void;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  shipped: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  returned: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
};

const tripStatusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  assigned: 'bg-blue-100 text-blue-800',
  'in-transit': 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
  }).format(amount);
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-MY', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OrderPanel({ conversationId, onClose }: OrderPanelProps) {
  const queryClient = useQueryClient();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [selectedPodImage, setSelectedPodImage] = useState<string | null>(null);

  // Fetch linked orders
  const {
    data: linkedOrdersData,
    isLoading: isLoadingLinked,
    refetch: refetchLinked,
  } = useQuery({
    queryKey: ['linkedOrders', conversationId],
    queryFn: () => getLinkedOrders(conversationId),
  });

  // Fetch available orders (for linking)
  const { data: availableOrders, isLoading: isLoadingSearch } = useQuery({
    queryKey: ['searchOrders', conversationId],
    queryFn: () => searchOrdersByContact(conversationId),
    enabled: showLinkDialog,
  });

  // Link order mutation
  const linkMutation = useMutation({
    mutationFn: (orderId: number) => linkOrder(conversationId, orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedOrders', conversationId] });
      setShowLinkDialog(false);
    },
  });

  // Unlink order mutation (uses first linked order for backward compat)
  const unlinkMutation = useMutation({
    mutationFn: () => {
      const firstOrder = linkedOrdersData?.orders?.[0];
      if (!firstOrder) throw new Error('No order to unlink');
      return unlinkOrder(conversationId, firstOrder.orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedOrders', conversationId] });
      setShowUnlinkDialog(false);
    },
  });

  // Get first linked order for display (this panel shows single order)
  const firstLinkedOrder = linkedOrdersData?.orders?.[0];
  const order = firstLinkedOrder?.order;
  const due = firstLinkedOrder?.due;
  const isLinked = linkedOrdersData?.linked && linkedOrdersData.orders.length > 0;

  return (
    <div className="w-80 border-l border-pink-200/50 dark:border-purple-800/50 bg-gradient-to-b from-white via-pink-50/20 to-lavender-50/20 dark:from-purple-950 dark:via-purple-900/20 dark:to-pink-950/20 flex flex-col h-full">
      {/* Header */}
      <div className="h-16 border-b border-pink-200/50 dark:border-purple-800/50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-pink-600 dark:text-pink-400" />
          <span className="font-semibold text-pink-900 dark:text-pink-100">Order Details</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetchLinked()}
            className="h-8 w-8 text-pink-600 dark:text-pink-400"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-pink-600 dark:text-pink-400"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isLoadingLinked ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-pink-500" />
            </div>
          ) : !isLinked ? (
            // No linked order
            <div className="text-center py-8">
              <Package className="h-12 w-12 mx-auto text-pink-300 dark:text-pink-700 mb-3" />
              <p className="text-pink-600 dark:text-pink-400 mb-4">No order linked to this conversation</p>
              <Button
                onClick={() => setShowLinkDialog(true)}
                className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600"
              >
                <Link2 className="h-4 w-4 mr-2" />
                Link Order
              </Button>
            </div>
          ) : order ? (
            // Linked order details
            <>
              {/* Order Header */}
              <Card className="border-pink-200/50 dark:border-purple-800/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg text-pink-900 dark:text-pink-100">
                      #{order.order_code}
                    </CardTitle>
                    <Badge className={statusColors[order.status.toLowerCase()] || 'bg-gray-100'}>
                      {order.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-pink-500 dark:text-pink-400">Type: {order.type}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Customer Info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-pink-500" />
                      <span className="text-pink-900 dark:text-pink-100">{order.customer_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-pink-500" />
                      <span className="text-pink-700 dark:text-pink-300">{order.customer_phone}</span>
                    </div>
                    {order.customer_address && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-pink-500 mt-0.5" />
                        <span className="text-pink-700 dark:text-pink-300">{order.customer_address}</span>
                      </div>
                    )}
                  </div>

                  {/* Delivery Date */}
                  {order.delivery_date && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-pink-500" />
                      <span className="text-pink-700 dark:text-pink-300">
                        Delivery: {formatDate(order.delivery_date)}
                      </span>
                    </div>
                  )}

                  {/* Trip Status */}
                  {order.trip_status && (
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-pink-500" />
                      <Badge className={tripStatusColors[order.trip_status.toLowerCase()] || 'bg-gray-100'}>
                        {order.trip_status}
                      </Badge>
                      {order.delivered_at && (
                        <span className="text-xs text-pink-500">
                          {formatDateTime(order.delivered_at)}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Financial Summary */}
              <Card className="border-pink-200/50 dark:border-purple-800/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-pink-900 dark:text-pink-100">
                    <DollarSign className="h-4 w-4" />
                    Financial Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-pink-600 dark:text-pink-400">Total</span>
                    <span className="font-medium text-pink-900 dark:text-pink-100">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-pink-600 dark:text-pink-400">Paid</span>
                    <span className="font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(order.paid_amount)}
                    </span>
                  </div>
                  <Separator className="bg-pink-200/50 dark:bg-purple-800/50" />
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-pink-600 dark:text-pink-400">Outstanding</span>
                    <span
                      className={cn(
                        'font-bold',
                        order.outstanding > 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-600 dark:text-green-400'
                      )}
                    >
                      {formatCurrency(order.outstanding)}
                    </span>
                  </div>
                  {order.outstanding > 0 && (
                    <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      Balance due
                    </div>
                  )}
                  {order.outstanding === 0 && (
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle className="h-3 w-3" />
                      Fully paid
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Order Items */}
              {order.items && order.items.length > 0 && (
                <Card className="border-pink-200/50 dark:border-purple-800/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-pink-900 dark:text-pink-100">
                      <FileText className="h-4 w-4" />
                      Items ({order.items.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {order.items.map((item, index) => (
                      <div key={item.item_id || index} className="flex justify-between text-sm">
                        <div className="flex-1">
                          <span className="text-pink-900 dark:text-pink-100">{item.product_name}</span>
                          <span className="text-pink-500 dark:text-pink-400 ml-2">x{item.quantity}</span>
                        </div>
                        <span className="text-pink-700 dark:text-pink-300">
                          {formatCurrency(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Payments */}
              {order.payments && order.payments.length > 0 && (
                <Card className="border-pink-200/50 dark:border-purple-800/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-pink-900 dark:text-pink-100">
                      <CreditCard className="h-4 w-4" />
                      Payments ({order.payments.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {order.payments.map((payment, index) => (
                      <div key={payment.payment_id || index} className="flex justify-between text-sm">
                        <div>
                          <span className="text-pink-900 dark:text-pink-100">{payment.method}</span>
                          <span className="text-pink-500 dark:text-pink-400 ml-2 text-xs">
                            {formatDateTime(payment.paid_at)}
                          </span>
                        </div>
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {formatCurrency(payment.amount)}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* POD Photos */}
              {order.pod_photo_urls && order.pod_photo_urls.length > 0 && (
                <Card className="border-pink-200/50 dark:border-purple-800/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-pink-900 dark:text-pink-100">
                      <ImageIcon className="h-4 w-4" />
                      Proof of Delivery
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      {order.pod_photo_urls.map((url, index) => (
                        <button
                          key={index}
                          onClick={() => setSelectedPodImage(url)}
                          className="aspect-square rounded-lg overflow-hidden border border-pink-200/50 dark:border-purple-800/50 hover:opacity-80 transition-opacity"
                        >
                          <img src={url} alt={`POD ${index + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowUnlinkDialog(true)}
                  className="flex-1 border-pink-200 dark:border-purple-700 text-pink-600 dark:text-pink-400"
                >
                  <Unlink className="h-4 w-4 mr-2" />
                  Unlink
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLinkDialog(true)}
                  className="flex-1 border-pink-200 dark:border-purple-700 text-pink-600 dark:text-pink-400"
                >
                  <Link2 className="h-4 w-4 mr-2" />
                  Change
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </ScrollArea>

      {/* Link Order Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Order</DialogTitle>
            <DialogDescription>
              Select an order to link to this conversation
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {isLoadingSearch ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="h-5 w-5 animate-spin text-pink-500" />
              </div>
            ) : availableOrders?.orders && availableOrders.orders.length > 0 ? (
              availableOrders.orders.map((o) => (
                <button
                  key={o.order_id}
                  onClick={() => linkMutation.mutate(o.order_id)}
                  disabled={linkMutation.isPending}
                  className="w-full p-3 text-left rounded-lg border border-pink-200 dark:border-purple-700 hover:bg-pink-50 dark:hover:bg-purple-900/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-pink-900 dark:text-pink-100">
                      #{o.order_code}
                    </span>
                    <Badge className={statusColors[o.status.toLowerCase()] || 'bg-gray-100'}>
                      {o.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-pink-600 dark:text-pink-400 mt-1">
                    {formatCurrency(o.total)} - {o.customer_name}
                  </div>
                </button>
              ))
            ) : (
              <p className="text-center text-pink-500 dark:text-pink-400 py-4">
                No orders found for this contact
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Confirmation Dialog */}
      <Dialog open={showUnlinkDialog} onOpenChange={setShowUnlinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink this order from the conversation?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnlinkDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => unlinkMutation.mutate()}
              disabled={unlinkMutation.isPending}
            >
              {unlinkMutation.isPending ? 'Unlinking...' : 'Unlink'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POD Image Viewer */}
      <Dialog open={!!selectedPodImage} onOpenChange={() => setSelectedPodImage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Proof of Delivery</DialogTitle>
          </DialogHeader>
          {selectedPodImage && (
            <img src={selectedPodImage} alt="POD" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
