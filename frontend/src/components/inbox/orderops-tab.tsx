'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package,
  RefreshCw,
  Link2,
  Unlink,
  Truck,
  MapPin,
  Phone,
  User,
  Calendar,
  CheckCircle,
  Wand2,
  Send,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Search,
  X,
  Sparkles,
  Receipt,
  CreditCard,
  Clock,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

// Premium status colors with gradients
const statusConfig: Record<string, { bg: string; text: string; dot: string }> = {
  pending: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  confirmed: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  processing: { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  shipped: { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  delivered: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  cancelled: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  returned: { bg: 'bg-orange-50 dark:bg-orange-950/40', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-MY', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateString?: string): string {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-MY', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Skeleton loader component
function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse bg-gradient-to-r from-pink-100 via-pink-50 to-pink-100 dark:from-pink-900/30 dark:via-pink-950/20 dark:to-pink-900/30 rounded', className)} />
  );
}

// Order card skeleton
function OrderCardSkeleton() {
  return (
    <div className="border border-pink-100 dark:border-pink-900/50 rounded-xl p-4 space-y-3 bg-white dark:bg-black/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status?.toLowerCase()] || statusConfig.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', config.bg, config.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', config.dot)} />
      {status}
    </span>
  );
}

// Payment progress bar
function PaymentProgress({ paid, total }: { paid: number; total: number }) {
  const percentage = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  const isPaid = percentage >= 100;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400">Payment Progress</span>
        <span className={cn('font-medium', isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white')}>
          {percentage.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500 ease-out',
            isPaid
              ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
              : 'bg-gradient-to-r from-pink-400 to-pink-500'
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Quick info pill
function InfoPill({ icon: Icon, label, value, className }: { icon: any; label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900/50', className)}>
      <Icon className="h-4 w-4 text-pink-500 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
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
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Parse message mutation
  const parseMutation = useMutation({
    mutationFn: (text: string) => parseConversationMessage(conversationId, { text }),
    onSuccess: (data: any) => {
      setParseResult(data);
      if (data.linked) {
        toast.success(`Order #${data.parsed?.data?.order_code || ''} created and linked!`, { duration: 4000 });
        queryClient.invalidateQueries({ queryKey: ['linkedOrders', conversationId] });
        setShowParseDialog(false);
      } else if (data.parsed?.data?.order_id) {
        toast.success('Order created successfully');
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
    staleTime: 0,
  });

  const handleRefresh = async () => {
    await refetchLinked();
    toast.success('Updated', { duration: 1500 });
  };

  // Fetch orders by contact
  const { data: contactOrders, isLoading: isLoadingContactSearch } = useQuery({
    queryKey: ['searchOrdersByContact', conversationId],
    queryFn: () => searchOrdersByContact(conversationId),
    enabled: showLinkDialog,
    select: (data) => ({ orders: Array.isArray(data?.orders) ? data.orders : [] }),
  });

  // Search orders
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['searchOrders', debouncedSearch],
    queryFn: () => searchOrders(debouncedSearch),
    enabled: showLinkDialog && debouncedSearch.length >= 2,
    select: (data) => ({ orders: Array.isArray(data?.orders) ? data.orders : [] }),
  });

  // Link order mutation
  const linkMutation = useMutation({
    mutationFn: (orderId: number) => linkOrder(conversationId, orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedOrders', conversationId] });
      setShowLinkDialog(false);
      setSearchQuery('');
      toast.success('Order linked successfully');
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
  const linkedOrderIds = new Set(linkedOrders.map(o => o.orderId));

  // Loading state with skeletons
  if (isLoadingLinked) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <OrderCardSkeleton />
        <OrderCardSkeleton />
      </div>
    );
  }

  // Empty state
  if (!isLinked || linkedOrders.length === 0) {
    return (
      <div className="p-4 space-y-6">
        {/* AI Parse Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500/10 via-purple-500/5 to-transparent border border-pink-200/50 dark:border-pink-800/50 p-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-pink-500/20 to-transparent rounded-full blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-pink-500/10">
                <Sparkles className="h-4 w-4 text-pink-500" />
              </div>
              <h6 className="font-semibold text-gray-900 dark:text-white">AI Order Parser</h6>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Paste any WhatsApp message and let AI extract order details automatically
            </p>
            <Button
              onClick={() => {
                setParseText('');
                setParseResult(null);
                setShowParseDialog(true);
              }}
              className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white shadow-lg shadow-pink-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-pink-500/30"
            >
              <Wand2 className="h-4 w-4 mr-2" />
              Parse Message
            </Button>
          </div>
        </div>

        {/* Empty State */}
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-pink-100 to-pink-50 dark:from-pink-900/30 dark:to-pink-950/20 flex items-center justify-center">
            <Package className="h-8 w-8 text-pink-400" />
          </div>
          <h5 className="font-semibold text-gray-900 dark:text-white mb-1">No Orders Linked</h5>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-[200px] mx-auto">
            Link orders to this conversation for quick access
          </p>
          <Button
            variant="outline"
            onClick={() => setShowLinkDialog(true)}
            className="border-pink-200 hover:border-pink-300 hover:bg-pink-50 dark:border-pink-800 dark:hover:border-pink-700 dark:hover:bg-pink-950/50"
          >
            <Link2 className="h-4 w-4 mr-2 text-pink-500" />
            Link Existing Order
          </Button>
        </div>

        {/* Dialogs */}
        {renderParseDialog()}
        {renderLinkDialog()}
      </div>
    );
  }

  // Render order details
  function renderOrderDetails(order: OrderDetails, due: OrderDue | undefined) {
    const totalExpected = due?.expected || order.total || 0;
    const totalPaid = due?.paid || order.paid_amount || 0;
    const toCollect = due?.to_collect || order.outstanding || 0;

    // Trip status config
    const tripStatusConfig: Record<string, { bg: string; text: string; dot: string }> = {
      planned: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
      dispatched: { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
      in_transit: { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500 animate-pulse' },
      delivered: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
      failed: { bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
      cancelled: { bg: 'bg-gray-50 dark:bg-gray-900/40', text: 'text-gray-700 dark:text-gray-300', dot: 'bg-gray-500' },
    };

    return (
      <div className="space-y-4 animate-in slide-in-from-top-2 duration-200 pt-4">
        {/* Customer Info */}
        <div className="grid grid-cols-2 gap-2">
          <InfoPill icon={User} label="Customer" value={order.customer_name} />
          {order.customer_phone && (
            <InfoPill icon={Phone} label="Phone" value={order.customer_phone} />
          )}
        </div>

        {/* Address */}
        {order.customer_address && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
            <MapPin className="h-4 w-4 text-pink-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Address</p>
              <p className="text-sm text-gray-900 dark:text-white">{order.customer_address}</p>
              {order.customer_map_url && (
                <a
                  href={order.customer_map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-xs text-pink-500 hover:text-pink-600 font-medium"
                >
                  Open in Maps <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Delivery & Driver Section */}
        <div className="p-3 rounded-lg bg-gradient-to-br from-indigo-50/80 to-violet-50/80 dark:from-indigo-950/40 dark:to-violet-950/40 border border-indigo-100 dark:border-indigo-900/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Delivery & Driver</span>
            </div>
            {order.trip_status && (
              <span className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                tripStatusConfig[order.trip_status.toLowerCase()]?.bg || tripStatusConfig.planned.bg,
                tripStatusConfig[order.trip_status.toLowerCase()]?.text || tripStatusConfig.planned.text
              )}>
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  tripStatusConfig[order.trip_status.toLowerCase()]?.dot || tripStatusConfig.planned.dot
                )} />
                {order.trip_status}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Driver */}
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Driver</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {order.driver_name || <span className="text-gray-400 italic">Not assigned</span>}
              </p>
              {order.driver_id && (
                <p className="text-[10px] text-gray-400">ID: {order.driver_id}</p>
              )}
            </div>

            {/* Trip ID */}
            {order.trip_id && (
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Trip</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">#{order.trip_id}</p>
              </div>
            )}
          </div>

          {/* Delivery Times */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-indigo-100 dark:border-indigo-800/50">
            {/* Scheduled */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-gray-400" />
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Scheduled</p>
              </div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {order.delivery_date ? formatDate(order.delivery_date) : '-'}
              </p>
              {order.planned_at && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDateTime(order.planned_at)}
                </p>
              )}
            </div>

            {/* Actual Delivery */}
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-gray-400" />
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Delivered</p>
              </div>
              {order.delivered_at ? (
                <>
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {formatDate(order.delivered_at)}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    {formatDateTime(order.delivered_at)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">Pending</p>
              )}
            </div>
          </div>
        </div>

        {/* Notes Section */}
        {order.notes && (
          <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
            <div className="flex items-center gap-2 mb-2">
              <Receipt className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">Notes</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{order.notes}</p>
          </div>
        )}

        {/* Payment Progress */}
        <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50 space-y-3">
          <PaymentProgress paid={totalPaid} total={totalExpected} />

          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Expected</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(totalExpected)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Paid</p>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Balance</p>
              <p className={cn(
                'text-sm font-semibold',
                toCollect > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
              )}>
                {formatCurrency(toCollect)}
              </p>
            </div>
          </div>
        </div>

        {/* Payments List */}
        {order.payments && order.payments.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <CreditCard className="h-3.5 w-3.5" />
              Payment History ({order.payments.length})
            </div>
            <div className="space-y-1">
              {order.payments.map((payment, index) => (
                <div key={payment.payment_id || index} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-900/30 hover:bg-gray-100 dark:hover:bg-gray-800/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/50">
                      <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatCurrency(payment.amount)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <span className="capitalize">{payment.method}</span>
                        {payment.category && (
                          <>
                            <span className="text-gray-300 dark:text-gray-600">•</span>
                            <span className="capitalize">{payment.category}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(payment.paid_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items */}
        {order.items && order.items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <Receipt className="h-3.5 w-3.5" />
              Items ({order.items.length})
            </div>
            <div className="space-y-1">
              {order.items.map((item, index) => (
                <div key={item.item_id || index} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-pink-500 bg-pink-50 dark:bg-pink-950/50 px-1.5 py-0.5 rounded">
                      ×{item.quantity}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-white truncate">{item.product_name}</span>
                    {item.returned && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400">
                        Returned
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex-shrink-0">{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* POD Photos */}
        {order.pod_photo_urls && order.pod_photo_urls.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <ImageIcon className="h-3.5 w-3.5" />
              Proof of Delivery ({order.pod_photo_urls.length})
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {order.pod_photo_urls.map((url, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedPodImage(url)}
                  className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-transparent hover:border-pink-500 transition-colors"
                >
                  <img src={url} alt={`POD ${index + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Signature */}
        {order.signature_url && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <CheckCircle className="h-3.5 w-3.5" />
              Customer Signature
            </div>
            <button
              onClick={() => setSelectedPodImage(order.signature_url!)}
              className="w-24 h-16 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-pink-500 dark:hover:border-pink-500 transition-colors bg-white dark:bg-gray-900"
            >
              <img src={order.signature_url} alt="Signature" className="w-full h-full object-contain" />
            </button>
          </div>
        )}

        {/* Unlink Button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          onClick={() => setOrderToUnlink(linkedOrders.find(o => o.order?.order_id === order.order_id) || null)}
        >
          <Unlink className="h-3.5 w-3.5 mr-1.5" />
          Unlink Order
        </Button>
      </div>
    );
  }

  // Render parse dialog
  function renderParseDialog() {
    return (
      <Dialog open={showParseDialog} onOpenChange={setShowParseDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-pink-100 dark:bg-pink-900/30">
                <Sparkles className="h-4 w-4 text-pink-500" />
              </div>
              AI Order Parser
            </DialogTitle>
            <DialogDescription>
              Paste a WhatsApp message and our AI will extract order details automatically
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Paste WhatsApp message here..."
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
              rows={6}
              className="resize-none border-gray-200 focus:border-pink-400 focus:ring-pink-400/20 dark:border-gray-800 dark:focus:border-pink-600"
            />
            {parseResult && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">Order Created</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleCopyResult} className="h-8 text-emerald-600">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {parseResult.parsed?.data?.order_id && (
                  <div className="flex items-center justify-between p-3 bg-white dark:bg-black rounded-lg">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">#{parseResult.parsed.data.order_code}</p>
                      <p className="text-xs text-gray-500">ID: {parseResult.parsed.data.order_id}</p>
                    </div>
                    {parseResult.linked ? (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
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
                        className="bg-pink-500 hover:bg-pink-600 text-white"
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1" />
                        Link
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowParseDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => parseMutation.mutate(parseText)}
              disabled={!parseText.trim() || parseMutation.isPending}
              className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white"
            >
              {parseMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Parse Message
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Render link dialog
  function renderLinkDialog() {
    const showSearchResults = debouncedSearch.length >= 2;
    const filteredSearchResults = searchResults?.orders?.filter(o => !linkedOrderIds.has(o.order_id)) || [];
    const filteredContactOrders = contactOrders?.orders?.filter(o => !linkedOrderIds.has(o.order_id)) || [];

    return (
      <Dialog open={showLinkDialog} onOpenChange={(open) => { setShowLinkDialog(open); if (!open) setSearchQuery(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Link Order</DialogTitle>
            <DialogDescription>
              Search by order code or select from this contact's orders
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by order code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-9 border-gray-200 focus:border-pink-400 focus:ring-pink-400/20 dark:border-gray-800"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto space-y-3">
              {/* Search Results */}
              {showSearchResults && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                    <Search className="h-3 w-3" />
                    Search Results
                    {isSearching && <RefreshCw className="h-3 w-3 animate-spin text-pink-500" />}
                  </p>
                  {!isSearching && filteredSearchResults.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-3">No orders found</p>
                  )}
                  {filteredSearchResults.map((o) => (
                    <OrderSelectCard key={o.order_id} order={o} onSelect={() => linkMutation.mutate(o.order_id)} disabled={linkMutation.isPending} />
                  ))}
                </div>
              )}

              {/* Contact's Orders */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-2">
                  <User className="h-3 w-3" />
                  Contact's Orders
                  {isLoadingContactSearch && <RefreshCw className="h-3 w-3 animate-spin text-pink-500" />}
                </p>
                {!isLoadingContactSearch && filteredContactOrders.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-3">No orders found for this contact</p>
                )}
                {filteredContactOrders.map((o) => (
                  <OrderSelectCard key={o.order_id} order={o} onSelect={() => linkMutation.mutate(o.order_id)} disabled={linkMutation.isPending} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkDialog(false); setSearchQuery(''); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Order select card
  function OrderSelectCard({ order, onSelect, disabled }: { order: OrderDetails; onSelect: () => void; disabled: boolean }) {
    return (
      <button
        onClick={onSelect}
        disabled={disabled}
        className="w-full p-3 text-left rounded-xl border border-gray-100 dark:border-gray-800 hover:border-pink-300 dark:hover:border-pink-700 hover:bg-pink-50/50 dark:hover:bg-pink-950/30 transition-all duration-150 bg-white dark:bg-black/50 group"
      >
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-900 dark:text-white group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
            #{order.order_code}
          </span>
          <StatusBadge status={order.status} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400 truncate">{order.customer_name}</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(order.total)}</span>
        </div>
      </button>
    );
  }

  // Main render with orders
  return (
    <ScrollArea className="h-[calc(100vh-280px)]">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h5 className="font-semibold text-gray-900 dark:text-white">
            {linkedOrders.length} Order{linkedOrders.length !== 1 ? 's' : ''}
          </h5>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={isRefetching}
              className="h-8 w-8 text-gray-500 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/50"
            >
              <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
            </Button>
            <Button
              size="sm"
              onClick={() => setShowLinkDialog(true)}
              className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white shadow-sm"
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Link
            </Button>
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-2">
          {linkedOrders.map((linkedOrder) => {
            const order = linkedOrder.order;
            const due = linkedOrder.due;
            const isExpanded = expandedOrderId === linkedOrder.orderId;
            const toCollect = due?.to_collect || order?.outstanding || 0;

            if (!order) return null;

            return (
              <div
                key={linkedOrder.id}
                className={cn(
                  'rounded-xl border transition-all duration-200',
                  isExpanded
                    ? 'border-pink-300 dark:border-pink-700 shadow-lg shadow-pink-500/10'
                    : 'border-gray-100 dark:border-gray-800 hover:border-pink-200 dark:hover:border-pink-800'
                )}
              >
                {/* Order Header */}
                <button
                  onClick={() => setExpandedOrderId(isExpanded ? null : linkedOrder.orderId)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-pink-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <a
                        href={`https://aaalyx.com/orders/${order.order_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-pink-500 hover:text-pink-600 hover:underline flex items-center gap-1"
                      >
                        #{order.order_code}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </a>
                      <StatusBadge status={order.status} />
                    </div>
                    <span className={cn(
                      'text-sm font-bold tabular-nums',
                      toCollect > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    )}>
                      {formatCurrency(toCollect)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm pl-6">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-gray-600 dark:text-gray-400 truncate">{order.customer_name}</span>
                      {order.driver_name && (
                        <>
                          <span className="text-gray-300 dark:text-gray-600">•</span>
                          <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400">
                            <Truck className="h-3 w-3" />
                            {order.driver_name}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {order.delivery_date && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatDate(order.delivery_date)}
                        </span>
                      )}
                      <span className="text-gray-400 dark:text-gray-500 text-xs">{order.type}</span>
                    </div>
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30">
                    {renderOrderDetails(order, due)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dialogs */}
      {renderParseDialog()}
      {renderLinkDialog()}

      {/* Unlink Dialog */}
      <Dialog open={!!orderToUnlink} onOpenChange={(open) => !open && setOrderToUnlink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlink Order</DialogTitle>
            <DialogDescription>
              Remove <span className="font-semibold text-pink-500">#{orderToUnlink?.orderCode}</span> from this conversation?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderToUnlink(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => orderToUnlink && unlinkMutation.mutate(orderToUnlink.orderId)}
              disabled={unlinkMutation.isPending}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {unlinkMutation.isPending ? 'Unlinking...' : 'Unlink Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* POD Image Viewer */}
      <Dialog open={!!selectedPodImage} onOpenChange={() => setSelectedPodImage(null)}>
        <DialogContent className="max-w-2xl p-2">
          {selectedPodImage && (
            <img src={selectedPodImage} alt="Proof of Delivery" className="w-full rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
