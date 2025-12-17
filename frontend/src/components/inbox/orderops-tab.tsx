'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
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
  FileText,
  Wand2,
  Send,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  getLinkedOrder,
  searchOrdersByContact,
  linkOrder,
  unlinkOrder,
  parseConversationMessage,
  type OrderDetails,
} from '@/lib/api/orderops';

interface OrderOpsTabProps {
  conversationId: string;
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

export function OrderOpsTab({ conversationId }: OrderOpsTabProps) {
  const queryClient = useQueryClient();
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showUnlinkDialog, setShowUnlinkDialog] = useState(false);
  const [showParseDialog, setShowParseDialog] = useState(false);
  const [parseText, setParseText] = useState('');
  const [parseResult, setParseResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [selectedPodImage, setSelectedPodImage] = useState<string | null>(null);

  // Parse message mutation
  const parseMutation = useMutation({
    mutationFn: (text: string) => parseConversationMessage(conversationId, { text }),
    onSuccess: (data) => {
      setParseResult(data);
      toast.success('Message parsed successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to parse message');
    },
  });

  const handleCopyResult = () => {
    if (parseResult) {
      navigator.clipboard.writeText(JSON.stringify(parseResult.parsed, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Fetch linked order
  const {
    data: linkedOrderData,
    isLoading: isLoadingLinked,
    refetch: refetchLinked,
  } = useQuery({
    queryKey: ['linkedOrder', conversationId],
    queryFn: () => getLinkedOrder(conversationId),
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
      queryClient.invalidateQueries({ queryKey: ['linkedOrder', conversationId] });
      setShowLinkDialog(false);
    },
  });

  // Unlink order mutation
  const unlinkMutation = useMutation({
    mutationFn: () => unlinkOrder(conversationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedOrder', conversationId] });
      setShowUnlinkDialog(false);
    },
  });

  const order = linkedOrderData?.order;
  const due = linkedOrderData?.due;
  const isLinked = linkedOrderData?.linked;

  if (isLoadingLinked) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLinked || !order) {
    return (
      <div className="p-4 space-y-4">
        {/* Parse Message Section */}
        <div className="border rounded-lg p-3">
          <h6 className="text-xs font-medium text-muted-foreground uppercase mb-2 flex items-center gap-1">
            <Wand2 className="h-3 w-3" />
            Parse Order Message
          </h6>
          <p className="text-xs text-muted-foreground mb-2">
            Paste a WhatsApp message to extract order details using AI
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              setParseText('');
              setParseResult(null);
              setShowParseDialog(true);
            }}
          >
            <Wand2 className="h-3 w-3 mr-1" />
            Parse Message
          </Button>
        </div>

        <Separator />

        {/* Link Order Section */}
        <div className="text-center py-4">
          <Package className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <h5 className="text-sm font-medium mb-1">No Order Linked</h5>
          <p className="text-xs text-muted-foreground mb-3">
            Link an existing order to track it
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowLinkDialog(true)}>
            <Link2 className="h-3 w-3 mr-1" />
            Link Order
          </Button>
        </div>

        {/* Parse Message Dialog */}
        <Dialog open={showParseDialog} onOpenChange={setShowParseDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Parse Order Message
              </DialogTitle>
              <DialogDescription>
                Paste a WhatsApp message to extract order details using AI (4-stage LLM pipeline)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Paste WhatsApp message here...&#10;&#10;Example:&#10;Customer: Ahmad&#10;Phone: 0123456789&#10;Address: 123 Jalan ABC&#10;Order: 2x Item A, 1x Item B&#10;Total: RM500"
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                rows={6}
                className="resize-none"
              />
              {parseResult && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Parse Result:</span>
                    <Button variant="ghost" size="sm" onClick={handleCopyResult}>
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  {/* Show order created info */}
                  {parseResult.parsed?.data?.order_id && (
                    <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                      <div>
                        <p className="text-sm font-medium text-green-700 dark:text-green-400">
                          Order #{parseResult.parsed.data.order_code} created
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-500">
                          ID: {parseResult.parsed.data.order_id}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          linkMutation.mutate(parseResult.parsed.data.order_id);
                          setShowParseDialog(false);
                        }}
                        disabled={linkMutation.isPending}
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        Link Order
                      </Button>
                    </div>
                  )}
                  <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                    {JSON.stringify(parseResult.parsed, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowParseDialog(false)}>
                Close
              </Button>
              <Button
                onClick={() => parseMutation.mutate(parseText)}
                disabled={!parseText.trim() || parseMutation.isPending}
              >
                {parseMutation.isPending ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3 mr-1" />
                    Parse
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : availableOrders?.orders && availableOrders.orders.length > 0 ? (
                availableOrders.orders.map((o) => (
                  <button
                    key={o.order_id}
                    onClick={() => linkMutation.mutate(o.order_id)}
                    disabled={linkMutation.isPending}
                    className="w-full p-3 text-left rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">#{o.order_code}</span>
                      <Badge className={statusColors[o.status.toLowerCase()] || 'bg-gray-100'}>
                        {o.status}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {formatCurrency(o.total)} - {o.customer_name}
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4">
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
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="p-4 space-y-4">
        {/* Order Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">#{order.order_code}</span>
              <Badge className={statusColors[order.status.toLowerCase()] || 'bg-gray-100'}>
                {order.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Type: {order.type}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetchLinked()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Customer Info */}
        <div className="space-y-2">
          <h6 className="text-xs font-medium text-muted-foreground uppercase">Customer</h6>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{order.customer_name}</span>
            </div>
            {order.customer_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{order.customer_phone}</span>
              </div>
            )}
            {order.customer_address && (
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                <span className="text-xs">{order.customer_address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {order.notes && (
          <>
            <Separator />
            <div className="space-y-2">
              <h6 className="text-xs font-medium text-muted-foreground uppercase">Notes</h6>
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </div>
          </>
        )}

        {/* Delivery */}
        {(order.delivery_date || order.trip_status) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h6 className="text-xs font-medium text-muted-foreground uppercase">Delivery</h6>
              <div className="space-y-1.5 text-sm">
                {order.delivery_date && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatDate(order.delivery_date)}</span>
                  </div>
                )}
                {order.trip_status && (
                  <div className="flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                    <Badge variant="outline" className="text-xs">
                      {order.trip_status}
                    </Badge>
                    {order.delivered_at && (
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(order.delivered_at)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Financial Summary */}
        <Separator />
        <div className="space-y-2">
          <h6 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            Financial
          </h6>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{formatCurrency(order.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-green-600">{formatCurrency(order.paid_amount)}</span>
            </div>
            <Separator className="my-1" />
            <div className="flex justify-between">
              <span className="font-medium">Outstanding</span>
              <span
                className={cn(
                  'font-bold',
                  order.outstanding > 0 ? 'text-red-600' : 'text-green-600'
                )}
              >
                {formatCurrency(order.outstanding)}
              </span>
            </div>
            {order.outstanding > 0 ? (
              <div className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                Balance due
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle className="h-3 w-3" />
                Fully paid
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        {order.items && order.items.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h6 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Items ({order.items.length})
              </h6>
              <div className="space-y-1.5">
                {order.items.map((item, index) => (
                  <div key={item.item_id || index} className="flex justify-between text-xs">
                    <div className="flex-1">
                      <span>{item.product_name}</span>
                      <span className="text-muted-foreground ml-1">x{item.quantity}</span>
                    </div>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Payments */}
        {order.payments && order.payments.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h6 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                Payments ({order.payments.length})
              </h6>
              <div className="space-y-1.5">
                {order.payments.map((payment, index) => (
                  <div key={payment.payment_id || index} className="flex justify-between text-xs">
                    <div>
                      <span>{payment.method}</span>
                      <span className="text-muted-foreground ml-1">
                        {formatDateTime(payment.paid_at)}
                      </span>
                    </div>
                    <span className="text-green-600">{formatCurrency(payment.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* POD Photos */}
        {order.pod_photo_urls && order.pod_photo_urls.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h6 className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                Proof of Delivery
              </h6>
              <div className="grid grid-cols-3 gap-1">
                {order.pod_photo_urls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedPodImage(url)}
                    className="aspect-square rounded overflow-hidden border hover:opacity-80 transition-opacity"
                  >
                    <img src={url} alt={`POD ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <Separator />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUnlinkDialog(true)}
            className="flex-1"
          >
            <Unlink className="h-3 w-3 mr-1" />
            Unlink
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowLinkDialog(true)}
            className="flex-1"
          >
            <Link2 className="h-3 w-3 mr-1" />
            Change
          </Button>
        </div>
      </div>

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
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableOrders?.orders && availableOrders.orders.length > 0 ? (
              availableOrders.orders.map((o) => (
                <button
                  key={o.order_id}
                  onClick={() => linkMutation.mutate(o.order_id)}
                  disabled={linkMutation.isPending}
                  className="w-full p-3 text-left rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">#{o.order_code}</span>
                    <Badge className={statusColors[o.status.toLowerCase()] || 'bg-gray-100'}>
                      {o.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatCurrency(o.total)} - {o.customer_name}
                  </div>
                </button>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-4">
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
    </ScrollArea>
  );
}
