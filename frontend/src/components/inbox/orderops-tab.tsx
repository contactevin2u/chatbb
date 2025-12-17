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
  pending: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-200',
  confirmed: 'bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-200',
  processing: 'bg-pink-100 text-pink-900 dark:bg-pink-900/50 dark:text-pink-200',
  shipped: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-200',
  delivered: 'bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-900 dark:bg-red-900/50 dark:text-red-200',
  returned: 'bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-200',
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
        <RefreshCw className="h-6 w-6 animate-spin text-pink-500" />
      </div>
    );
  }

  if (!isLinked || linkedOrders.length === 0) {
    return (
      <div className="p-4 space-y-4">
        {/* Parse Message Section */}
        <div className="border border-pink-200 dark:border-pink-800 rounded-lg p-3 bg-white dark:bg-black">
          <h6 className="text-xs font-semibold text-black dark:text-white uppercase mb-2 flex items-center gap-1">
            <Wand2 className="h-3 w-3 text-pink-500" />
            Parse Order Message
          </h6>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            Paste a WhatsApp message to extract order details using AI
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full border-pink-300 hover:bg-pink-50 hover:border-pink-400 dark:border-pink-700 dark:hover:bg-pink-950 dark:hover:border-pink-600"
            onClick={() => {
              setParseText('');
              setParseResult(null);
              setShowParseDialog(true);
            }}
          >
            <Wand2 className="h-3 w-3 mr-1 text-pink-500" />
            Parse Message
          </Button>
        </div>

        <Separator className="bg-pink-200 dark:bg-pink-800" />

        {/* Link Order Section */}
        <div className="text-center py-4">
          <Package className="h-10 w-10 mx-auto text-pink-300 dark:text-pink-700 mb-2" />
          <h5 className="text-sm font-semibold text-black dark:text-white mb-1">No Orders Linked</h5>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Link existing orders to track them
          </p>
          <Button
            size="sm"
            onClick={() => setShowLinkDialog(true)}
            className="bg-pink-500 hover:bg-pink-600 text-white"
          >
            <Link2 className="h-3 w-3 mr-1" />
            Link Order
          </Button>
        </div>

        {/* Parse Message Dialog */}
        <Dialog open={showParseDialog} onOpenChange={setShowParseDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-black dark:text-white">
                <Wand2 className="h-5 w-5 text-pink-500" />
                Parse Order Message
              </DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                Paste a WhatsApp message to extract order details using AI (4-stage LLM pipeline)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Paste WhatsApp message here...&#10;&#10;Example:&#10;Customer: Ahmad&#10;Phone: 0123456789&#10;Address: 123 Jalan ABC&#10;Order: 2x Item A, 1x Item B&#10;Total: RM500"
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                rows={6}
                className="resize-none border-pink-200 focus:border-pink-400 focus:ring-pink-400 dark:border-pink-800 dark:focus:border-pink-600"
              />
              {parseResult && (
                <div className="border border-pink-200 dark:border-pink-800 rounded-lg p-3 bg-pink-50/50 dark:bg-pink-950/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-black dark:text-white">Parse Result:</span>
                    <Button variant="ghost" size="sm" onClick={handleCopyResult} className="text-pink-500 hover:text-pink-600">
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  {/* Show order created info */}
                  {parseResult.parsed?.data?.order_id && (
                    <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/50 rounded border border-green-300 dark:border-green-800">
                      <div>
                        <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                          Order #{parseResult.parsed.data.order_code} created
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-400">
                          ID: {parseResult.parsed.data.order_id}
                        </p>
                      </div>
                      {parseResult.linked ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300">
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
                          className="bg-pink-500 hover:bg-pink-600 text-white"
                        >
                          <Link2 className="h-3 w-3 mr-1" />
                          Link Order
                        </Button>
                      )}
                    </div>
                  )}
                  <pre className="text-xs overflow-auto max-h-40 whitespace-pre-wrap text-black dark:text-white bg-white dark:bg-black p-2 rounded border">
                    {JSON.stringify(parseResult.parsed, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowParseDialog(false)} className="border-gray-300 dark:border-gray-700">
                Close
              </Button>
              <Button
                onClick={() => parseMutation.mutate(parseText)}
                disabled={!parseText.trim() || parseMutation.isPending}
                className="bg-pink-500 hover:bg-pink-600 text-white"
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
              <DialogTitle className="text-black dark:text-white">Link Order</DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-gray-400">
                Search by order code or select from contact's orders
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Search Input */}
              <Input
                placeholder="Search by order code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-pink-200 focus:border-pink-400 focus:ring-pink-400 dark:border-pink-800 dark:focus:border-pink-600"
              />

              <div className="max-h-64 overflow-y-auto space-y-2">
                {/* Search Results */}
                {searchQuery.length >= 2 && (
                  <>
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase">Search Results</p>
                    {isSearching ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="h-5 w-5 animate-spin text-pink-500" />
                      </div>
                    ) : searchResults?.orders && searchResults.orders.length > 0 ? (
                      searchResults.orders
                        .filter(o => !linkedOrderIds.has(o.order_id))
                        .map((o) => (
                          <button
                            key={o.order_id}
                            onClick={() => linkMutation.mutate(o.order_id)}
                            disabled={linkMutation.isPending}
                            className="w-full p-3 text-left rounded-lg border border-pink-200 dark:border-pink-800 hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-colors bg-white dark:bg-black"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-black dark:text-white">#{o.order_code}</span>
                              <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100 text-gray-900'}>
                                {o.status}
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {formatCurrency(o.total)} - {o.customer_name}
                            </div>
                          </button>
                        ))
                    ) : (
                      <p className="text-center text-gray-500 py-2 text-sm">
                        No orders found
                      </p>
                    )}
                    <Separator className="my-2 bg-pink-200 dark:bg-pink-800" />
                  </>
                )}

                {/* Contact's Orders */}
                <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase">Contact's Orders</p>
                {isLoadingContactSearch ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-pink-500" />
                  </div>
                ) : contactOrders?.orders && contactOrders.orders.length > 0 ? (
                  contactOrders.orders
                    .filter(o => !linkedOrderIds.has(o.order_id))
                    .map((o) => (
                      <button
                        key={o.order_id}
                        onClick={() => linkMutation.mutate(o.order_id)}
                        disabled={linkMutation.isPending}
                        className="w-full p-3 text-left rounded-lg border border-pink-200 dark:border-pink-800 hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-colors bg-white dark:bg-black"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-black dark:text-white">#{o.order_code}</span>
                          <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100 text-gray-900'}>
                            {o.status}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {formatCurrency(o.total)} - {o.customer_name}
                        </div>
                      </button>
                    ))
                ) : (
                  <p className="text-center text-gray-500 py-4">
                    No orders found for this contact
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowLinkDialog(false); setSearchQuery(''); }} className="border-gray-300 dark:border-gray-700">
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
          <User className="h-3.5 w-3.5 text-pink-500" />
          <span className="text-black dark:text-white">{order.customer_name}</span>
        </div>
        {order.customer_phone && (
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-pink-500" />
            <span className="text-gray-700 dark:text-gray-300">{order.customer_phone}</span>
          </div>
        )}
        {order.customer_address && (
          <div className="flex items-start gap-2">
            <MapPin className="h-3.5 w-3.5 text-pink-500 mt-0.5" />
            <div className="flex-1">
              <span className="text-xs text-gray-700 dark:text-gray-300">{order.customer_address}</span>
              {order.customer_map_url && (
                <a
                  href={order.customer_map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-pink-500 hover:text-pink-600 hover:underline font-medium"
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
        <div className="space-y-1.5 text-sm border-t border-pink-200 dark:border-pink-800 pt-2">
          {order.delivery_date && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-pink-500" />
              <span className="text-black dark:text-white">{formatDate(order.delivery_date)}</span>
            </div>
          )}
          {order.driver_name && (
            <div className="flex items-center gap-2">
              <Truck className="h-3.5 w-3.5 text-pink-500" />
              <span className="text-black dark:text-white">{order.driver_name}</span>
            </div>
          )}
          {order.trip_status && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs border-pink-300 dark:border-pink-700 text-black dark:text-white">
                {order.trip_status}
              </Badge>
              {order.delivered_at && (
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {formatDateTime(order.delivered_at)}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Financial */}
      <div className="border-t border-pink-200 dark:border-pink-800 pt-2 space-y-1 text-sm">
        {due && due.monthly_amount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-gray-400">{formatCurrency(due.monthly_amount)}/mo × {due.months_elapsed}mo</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Expected</span>
          <span className="text-black dark:text-white font-medium">{formatCurrency(due?.expected || order.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600 dark:text-gray-400">Paid</span>
          <span className="text-green-600 dark:text-green-400 font-medium">{formatCurrency(due?.paid || order.paid_amount)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span className="text-black dark:text-white">To Collect</span>
          <span className={(due?.to_collect || order.outstanding) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
            {formatCurrency(due?.to_collect || order.outstanding)}
          </span>
        </div>
      </div>

      {/* Items */}
      {order.items && order.items.length > 0 && (
        <div className="border-t border-pink-200 dark:border-pink-800 pt-2">
          <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase mb-1">Items ({order.items.length})</p>
          <div className="space-y-1">
            {order.items.map((item, index) => (
              <div key={item.item_id || index} className="flex justify-between text-xs">
                <span className="text-black dark:text-white">{item.product_name} x{item.quantity}</span>
                <span className="text-gray-700 dark:text-gray-300">{formatCurrency(item.subtotal)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* POD Photos */}
      {order.pod_photo_urls && order.pod_photo_urls.length > 0 && (
        <div className="border-t border-pink-200 dark:border-pink-800 pt-2">
          <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase mb-1">Proof of Delivery</p>
          <div className="grid grid-cols-4 gap-1">
            {order.pod_photo_urls.map((url, index) => (
              <button
                key={index}
                onClick={() => setSelectedPodImage(url)}
                className="aspect-square rounded overflow-hidden border border-pink-200 dark:border-pink-800 hover:opacity-80"
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
          <h5 className="text-sm font-semibold text-black dark:text-white">
            {linkedOrders.length} Order{linkedOrders.length !== 1 ? 's' : ''} Linked
          </h5>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefetching}
              className="h-8 w-8 text-pink-500 hover:text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950"
            >
              <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowLinkDialog(true)}
              className="bg-pink-500 hover:bg-pink-600 text-white"
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
              className="border border-pink-200 dark:border-pink-800 rounded-lg overflow-hidden bg-white dark:bg-black"
            >
              {/* Order Header (always visible) */}
              <button
                onClick={() => setExpandedOrderId(isExpanded ? null : linkedOrder.orderId)}
                className="w-full p-3 text-left hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://aaalyx.com/orders/${order.order_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-pink-500 hover:text-pink-600 hover:underline"
                    >
                      #{order.order_code}
                    </a>
                    <Badge className={statusColors[order.status?.toLowerCase()] || 'bg-gray-100 text-gray-900'}>
                      {order.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-sm font-semibold",
                      (due?.to_collect || order.outstanding) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    )}>
                      {formatCurrency(due?.to_collect || order.outstanding)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs">
                  <span className="text-gray-700 dark:text-gray-300">{order.customer_name}</span>
                  <span className="text-gray-500 dark:text-gray-500">{order.type}</span>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-pink-200 dark:border-pink-800 bg-pink-50/50 dark:bg-pink-950/30">
                  {renderOrderDetails(order, due)}

                  {/* Unlink Button */}
                  <div className="mt-3 pt-2 border-t border-pink-200 dark:border-pink-800">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50"
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
            <DialogTitle className="text-black dark:text-white">Link Order</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Search by order code or select from contact's orders
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search Input */}
            <Input
              placeholder="Search by order code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-pink-200 focus:border-pink-400 focus:ring-pink-400 dark:border-pink-800 dark:focus:border-pink-600"
            />

            <div className="max-h-64 overflow-y-auto space-y-2">
              {/* Search Results */}
              {searchQuery.length >= 2 && (
                <>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase">Search Results</p>
                  {isSearching ? (
                    <div className="flex items-center justify-center py-4">
                      <RefreshCw className="h-5 w-5 animate-spin text-pink-500" />
                    </div>
                  ) : searchResults?.orders && searchResults.orders.length > 0 ? (
                    searchResults.orders
                      .filter(o => !linkedOrderIds.has(o.order_id))
                      .map((o) => (
                        <button
                          key={o.order_id}
                          onClick={() => linkMutation.mutate(o.order_id)}
                          disabled={linkMutation.isPending}
                          className="w-full p-3 text-left rounded-lg border border-pink-200 dark:border-pink-800 hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-colors bg-white dark:bg-black"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-black dark:text-white">#{o.order_code}</span>
                            <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100 text-gray-900'}>
                              {o.status}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {formatCurrency(o.total)} - {o.customer_name}
                          </div>
                        </button>
                      ))
                  ) : (
                    <p className="text-center text-gray-500 py-2 text-sm">
                      No orders found
                    </p>
                  )}
                  <Separator className="my-2 bg-pink-200 dark:bg-pink-800" />
                </>
              )}

              {/* Contact's Orders */}
              <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold uppercase">Contact's Orders</p>
              {isLoadingContactSearch ? (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-pink-500" />
                </div>
              ) : contactOrders?.orders && contactOrders.orders.length > 0 ? (
                contactOrders.orders
                  .filter(o => !linkedOrderIds.has(o.order_id))
                  .map((o) => (
                    <button
                      key={o.order_id}
                      onClick={() => linkMutation.mutate(o.order_id)}
                      disabled={linkMutation.isPending}
                      className="w-full p-3 text-left rounded-lg border border-pink-200 dark:border-pink-800 hover:bg-pink-50 dark:hover:bg-pink-950/50 transition-colors bg-white dark:bg-black"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-black dark:text-white">#{o.order_code}</span>
                        <Badge className={statusColors[o.status?.toLowerCase()] || 'bg-gray-100 text-gray-900'}>
                          {o.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {formatCurrency(o.total)} - {o.customer_name}
                      </div>
                    </button>
                  ))
              ) : (
                <p className="text-center text-gray-500 py-4">
                  No orders found for this contact
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkDialog(false); setSearchQuery(''); }} className="border-gray-300 dark:border-gray-700">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlink Confirmation Dialog */}
      <Dialog open={!!orderToUnlink} onOpenChange={(open) => !open && setOrderToUnlink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Unlink Order</DialogTitle>
            <DialogDescription className="text-gray-600 dark:text-gray-400">
              Are you sure you want to unlink order <span className="font-semibold text-pink-500">#{orderToUnlink?.orderCode}</span> from this conversation?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderToUnlink(null)} className="border-gray-300 dark:border-gray-700">
              Cancel
            </Button>
            <Button
              onClick={() => orderToUnlink && unlinkMutation.mutate(orderToUnlink.orderId)}
              disabled={unlinkMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
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
            <DialogTitle className="text-black dark:text-white">Proof of Delivery</DialogTitle>
          </DialogHeader>
          {selectedPodImage && (
            <img src={selectedPodImage} alt="POD" className="w-full rounded-lg border border-pink-200 dark:border-pink-800" />
          )}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
