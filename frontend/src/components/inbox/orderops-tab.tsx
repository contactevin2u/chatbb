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
import { Input } from '@/components/ui/input';
import {
  getLinkedOrders,
  searchOrdersByContact,
  searchOrders,
  linkOrder,
  unlinkOrder,
  parseConversationMessage,
  type OrderDetails,
  type LinkedOrder,
  type OrderDue,
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
  const [orderToUnlink, setOrderToUnlink] = useState<LinkedOrder | null>(null);
  const [showParseDialog, setShowParseDialog] = useState(false);
  const [parseText, setParseText] = useState('');
  const [parseResult, setParseResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [selectedPodImage, setSelectedPodImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Parse message mutation (auto-links if order created)
  const parseMutation = useMutation({
    mutationFn: (text: string) => parseConversationMessage(conversationId, { text }),
    onSuccess: (data: any) => {
      setParseResult(data);
      if (data.linked) {
        toast.success(`Order #${data.parsed?.data?.order_code || ''} created and linked!`);
        // Refresh the linked orders data
        queryClient.invalidateQueries({ queryKey: ['linkedOrders', conversationId] });
        setShowParseDialog(false);
      } else if (data.parsed?.data?.order_id) {
        toast.success('Order created successfully');
      } else {
        toast.success('Message parsed successfully');
      }
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

  // Fetch linked orders
  const {
    data: linkedOrdersData,
    isLoading: isLoadingLinked,
    isFetching: isRefetching,
    refetch: refetchLinked,
  } = useQuery({
    queryKey: ['linkedOrders', conversationId],
    queryFn: () => getLinkedOrders(conversationId),
    staleTime: 0, // Always fetch fresh data
  });

  const handleRefresh = async () => {
    toast.loading('Refreshing orders...', { id: 'refresh-order' });
    try {
      await refetchLinked();
      toast.success('Order data refreshed', { id: 'refresh-order' });
    } catch {
      toast.error('Failed to refresh', { id: 'refresh-order' });
    }
  };

  // Fetch available orders by contact (for linking)
  const { data: contactOrders, isLoading: isLoadingContactSearch } = useQuery({
    queryKey: ['searchOrdersByContact', conversationId],
    queryFn: () => searchOrdersByContact(conversationId),
    enabled: showLinkDialog,
  });

  // Search orders by code
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['searchOrders', searchQuery],
    queryFn: () => searchOrders(searchQuery),
    enabled: showLinkDialog && searchQuery.length >= 2,
  });

  // Link order mutation
  const linkMutation = useMutation({
    mutationFn: (orderId: number) => linkOrder(conversationId, orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedOrders', conversationId] });
      setShowLinkDialog(false);
      setSearchQuery('');
      toast.success('Order linked');
    },
  });

  // Unlink order mutation
  const unlinkMutation = useMutation({
    mutationFn: (orderId: number) => unlinkOrder(conversationId, orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedOrders', conversationId] });
      setOrderToUnlink(null);
      toast.success('Order unlinked');
    },
  });

  const linkedOrders = linkedOrdersData?.orders || [];
  const isLinked = linkedOrdersData?.linked;

  // Get already linked order IDs to filter from search results
  const linkedOrderIds = new Set(linkedOrders.map(o => o.orderId));

  if (isLoadingLinked) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isLinked || linkedOrders.length === 0) {
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
          <h5 className="text-sm font-medium mb-1">No Orders Linked</h5>
          <p className="text-xs text-muted-foreground mb-3">
            Link existing orders to track them
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
                      {parseResult.linked ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Linked
                        </Badge>
                      ) : (
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
                      )}
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
        <Dialog open={showLinkDialog} onOpenChange={(open) => { setShowLinkDialog(open); if (!open) setSearchQuery(''); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Link Order</DialogTitle>
              <DialogDescription>
                Search by order code or select from contact's orders
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Search Input */}
              <Input
                placeholder="Search by order code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="max-h-64 overflow-y-auto space-y-2">
                {/* Search Results */}
                {searchQuery.length >= 2 && (
                  <>
                    <p className="text-xs text-muted-foreground font-medium">Search Results</p>
                    {isSearching ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : searchResults?.orders && searchResults.orders.length > 0 ? (
                      searchResults.orders
                        .filter(o => !linkedOrderIds.has(o.order_id))
                        .map((o) => (
                          <button
                            key={o.order_id}
                            onClick={() => linkMutation.mutate(o.order_id)}
                            disabled={linkMutation.isPending}
                            className="w-full p-3 text-left rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">#{o.order_code}</span>
                              <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100'}>
                                {o.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {formatCurrency(o.total)} - {o.customer_name}
                            </div>
                          </button>
                        ))
                    ) : (
                      <p className="text-center text-muted-foreground py-2 text-sm">
                        No orders found
                      </p>
                    )}
                    <Separator className="my-2" />
                  </>
                )}

                {/* Contact's Orders */}
                <p className="text-xs text-muted-foreground font-medium">Contact's Orders</p>
                {isLoadingContactSearch ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : contactOrders?.orders && contactOrders.orders.length > 0 ? (
                  contactOrders.orders
                    .filter(o => !linkedOrderIds.has(o.order_id))
                    .map((o) => (
                      <button
                        key={o.order_id}
                        onClick={() => linkMutation.mutate(o.order_id)}
                        disabled={linkMutation.isPending}
                        className="w-full p-3 text-left rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">#{o.order_code}</span>
                          <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100'}>
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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowLinkDialog(false); setSearchQuery(''); }}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Helper function to render order details
  const renderOrderDetails = (order: OrderDetails, due: OrderDue | undefined) => (
    <div className="space-y-3 pt-2">
      {/* Customer Info */}
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
            <div className="flex-1">
              <span className="text-xs">{order.customer_address}</span>
              {order.customer_map_url && (
                <a
                  href={order.customer_map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-primary hover:underline"
                >
                  Map
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delivery */}
      {(order.delivery_date || order.trip_status || order.driver_name) && (
        <div className="space-y-1.5 text-sm border-t pt-2">
          {order.delivery_date && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{formatDate(order.delivery_date)}</span>
            </div>
          )}
          {order.driver_name && (
            <div className="flex items-center gap-2">
              <Truck className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{order.driver_name}</span>
            </div>
          )}
          {order.trip_status && (
            <div className="flex items-center gap-2">
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
      )}

      {/* Financial */}
      <div className="border-t pt-2 space-y-1 text-sm">
        {due && due.monthly_amount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{formatCurrency(due.monthly_amount)}/mo × {due.months_elapsed}mo</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Expected</span>
          <span>{formatCurrency(due?.expected || order.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Paid</span>
          <span className="text-green-600">{formatCurrency(due?.paid || order.paid_amount)}</span>
        </div>
        <div className="flex justify-between font-medium">
          <span>To Collect</span>
          <span className={(due?.to_collect || order.outstanding) > 0 ? 'text-red-600' : 'text-green-600'}>
            {formatCurrency(due?.to_collect || order.outstanding)}
          </span>
        </div>
      </div>

      {/* Items */}
      {order.items && order.items.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-xs text-muted-foreground mb-1">Items ({order.items.length})</p>
          <div className="space-y-1">
            {order.items.map((item, index) => (
              <div key={item.item_id || index} className="flex justify-between text-xs">
                <span>{item.product_name} x{item.quantity}</span>
                <span>{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* POD Photos */}
      {order.pod_photo_urls && order.pod_photo_urls.length > 0 && (
        <div className="border-t pt-2">
          <p className="text-xs text-muted-foreground mb-1">Proof of Delivery</p>
          <div className="grid grid-cols-4 gap-1">
            {order.pod_photo_urls.map((url, index) => (
              <button
                key={index}
                onClick={() => setSelectedPodImage(url)}
                className="aspect-square rounded overflow-hidden border hover:opacity-80"
              >
                <img src={url} alt={`POD ${index + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="p-4 space-y-3">
        {/* Header with actions */}
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-medium">
            {linkedOrders.length} Order{linkedOrders.length !== 1 ? 's' : ''} Linked
          </h5>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefetching}
              className="h-8 w-8"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLinkDialog(true)}
            >
              <Link2 className="h-3 w-3 mr-1" />
              Link More
            </Button>
          </div>
        </div>

        {/* Orders List */}
        {linkedOrders.map((linkedOrder) => {
          const order = linkedOrder.order;
          const due = linkedOrder.due;
          const isExpanded = expandedOrderId === linkedOrder.orderId;

          if (!order) return null;

          return (
            <div
              key={linkedOrder.id}
              className="border rounded-lg overflow-hidden"
            >
              {/* Order Header (always visible) */}
              <button
                onClick={() => setExpandedOrderId(isExpanded ? null : linkedOrder.orderId)}
                className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://aaalyx.com/orders/${order.order_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-primary hover:underline"
                    >
                      #{order.order_code}
                    </a>
                    <Badge className={statusColors[order.status?.toLowerCase()] || 'bg-gray-100'}>
                      {order.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-medium",
                      (due?.to_collect || order.outstanding) > 0 ? 'text-red-600' : 'text-green-600'
                    )}>
                      {formatCurrency(due?.to_collect || order.outstanding)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>{order.customer_name}</span>
                  <span>{order.type}</span>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t bg-muted/20">
                  {renderOrderDetails(order, due)}

                  {/* Unlink Button */}
                  <div className="mt-3 pt-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => setOrderToUnlink(linkedOrder)}
                    >
                      <Unlink className="h-3 w-3 mr-1" />
                      Unlink Order
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Link Order Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={(open) => { setShowLinkDialog(open); if (!open) setSearchQuery(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Order</DialogTitle>
            <DialogDescription>
              Search by order code or select from contact's orders
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search Input */}
            <Input
              placeholder="Search by order code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="max-h-64 overflow-y-auto space-y-2">
              {/* Search Results */}
              {searchQuery.length >= 2 && (
                <>
                  <p className="text-xs text-muted-foreground font-medium">Search Results</p>
                  {isSearching ? (
                    <div className="flex items-center justify-center py-4">
                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : searchResults?.orders && searchResults.orders.length > 0 ? (
                    searchResults.orders
                      .filter(o => !linkedOrderIds.has(o.order_id))
                      .map((o) => (
                        <button
                          key={o.order_id}
                          onClick={() => linkMutation.mutate(o.order_id)}
                          disabled={linkMutation.isPending}
                          className="w-full p-3 text-left rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">#{o.order_code}</span>
                            <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100'}>
                              {o.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {formatCurrency(o.total)} - {o.customer_name}
                          </div>
                        </button>
                      ))
                  ) : (
                    <p className="text-center text-muted-foreground py-2 text-sm">
                      No orders found
                    </p>
                  )}
                  <Separator className="my-2" />
                </>
              )}

              {/* Contact's Orders */}
              <p className="text-xs text-muted-foreground font-medium">Contact's Orders</p>
              {isLoadingContactSearch ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : contactOrders?.orders && contactOrders.orders.length > 0 ? (
                contactOrders.orders
                  .filter(o => !linkedOrderIds.has(o.order_id))
                  .map((o) => (
                    <button
                      key={o.order_id}
                      onClick={() => linkMutation.mutate(o.order_id)}
                      disabled={linkMutation.isPending}
                      className="w-full p-3 text-left rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">#{o.order_code}</span>
                        <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100'}>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkDialog(false); setSearchQuery(''); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Confirmation Dialog */}
      <Dialog open={!!orderToUnlink} onOpenChange={(open) => !open && setOrderToUnlink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to unlink order #{orderToUnlink?.orderCode} from this conversation?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderToUnlink(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => orderToUnlink && unlinkMutation.mutate(orderToUnlink.orderId)}
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
