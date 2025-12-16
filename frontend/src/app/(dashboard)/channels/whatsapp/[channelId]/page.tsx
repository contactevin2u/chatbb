'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  Trash2,
  RefreshCw,
  Settings,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getWhatsAppChannelStatus,
  disconnectWhatsAppChannel,
  reconnectWhatsAppChannel,
  deleteWhatsAppChannel,
  clearWhatsAppSession,
} from '@/lib/api/channels';
import { getChannelStatus } from '@/lib/constants/channel-status';

export default function ChannelSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const channelId = params.channelId as string;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clearSessionDialogOpen, setClearSessionDialogOpen] = useState(false);

  const { data: channelStatus, isLoading } = useQuery({
    queryKey: ['channel-status', channelId],
    queryFn: () => getWhatsAppChannelStatus(channelId),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectWhatsAppChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-status', channelId] });
      toast.success('Channel disconnected');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disconnect');
    },
  });

  const reconnectMutation = useMutation({
    mutationFn: () => reconnectWhatsAppChannel(channelId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['channel-status', channelId] });
      if (data.hasAuthState) {
        toast.success('Reconnecting using saved session...');
      } else {
        toast.info('No saved session. Redirecting to QR code...');
        router.push(`/channels/whatsapp/${channelId}/connect`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reconnect');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWhatsAppChannel(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-channels'] });
      toast.success('Channel deleted');
      router.push('/channels');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete channel');
    },
  });

  const clearSessionMutation = useMutation({
    mutationFn: () => clearWhatsAppSession(channelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-status', channelId] });
      setClearSessionDialogOpen(false);
      toast.success('Session cleared. Please scan QR code to reconnect.');
      router.push(`/channels/whatsapp/${channelId}/connect`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to clear session');
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-muted rounded" />
          <Card>
            <CardHeader>
              <div className="h-6 w-48 bg-muted rounded" />
              <div className="h-4 w-64 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const status = getChannelStatus(channelStatus?.status);
  const StatusIcon = status.icon;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Back button */}
      <Link
        href="/channels"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Channels
      </Link>

      {/* Channel Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <MessageSquare className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <CardTitle>WhatsApp Channel</CardTitle>
                <CardDescription>
                  {channelStatus?.identifier !== 'pending'
                    ? `+${channelStatus?.identifier}`
                    : 'Not connected'}
                </CardDescription>
              </div>
            </div>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${status.bgColor}`}>
              <StatusIcon
                className={`h-4 w-4 ${status.color} ${
                  channelStatus?.status === 'CONNECTING' ? 'animate-spin' : ''
                }`}
              />
              <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Channel ID</Label>
              <p className="font-mono text-sm">{channelId}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Last Connected</Label>
              <p className="text-sm">
                {channelStatus?.lastConnectedAt
                  ? new Date(channelStatus.lastConnectedAt).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {channelStatus?.status === 'CONNECTED' ? (
              <Button
                variant="outline"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Disconnecting...
                  </>
                ) : (
                  <>
                    <WifiOff className="mr-2 h-4 w-4" />
                    Disconnect
                  </>
                )}
              </Button>
            ) : (
              <>
                {channelStatus?.status === 'CONNECTING' && (
                  <Button disabled variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </Button>
                )}
                {/* Reconnect button - tries to use saved session */}
                <Button
                  onClick={() => reconnectMutation.mutate()}
                  disabled={reconnectMutation.isPending}
                  variant={channelStatus?.status === 'CONNECTING' ? 'secondary' : 'default'}
                >
                  {reconnectMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Reconnecting...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {channelStatus?.status === 'CONNECTING' ? 'Retry' : 'Reconnect'}
                    </>
                  )}
                </Button>
                {/* Connect button - always shows QR code */}
                <Button variant="outline" asChild>
                  <Link href={`/channels/whatsapp/${channelId}/connect`}>
                    <Wifi className="mr-2 h-4 w-4" />
                    Scan QR Code
                  </Link>
                </Button>
              </>
            )}
          </div>
          {channelStatus?.status === 'CONNECTING' && (
            <p className="text-sm text-muted-foreground">
              If stuck connecting, click &quot;Retry&quot; or &quot;Scan QR Code&quot; to try again.
            </p>
          )}
          {(channelStatus?.status === 'DISCONNECTED' || channelStatus?.status === 'ERROR') &&
           channelStatus?.hasAuthState && (
            <p className="text-sm text-muted-foreground">
              Session saved. Click &quot;Reconnect&quot; to restore without scanning QR code.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Channel Settings
          </CardTitle>
          <CardDescription>Configure this WhatsApp channel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">Channel Name</Label>
            <Input id="channel-name" placeholder="My WhatsApp" disabled />
            <p className="text-xs text-muted-foreground">
              Channel name editing coming soon
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions that will affect this channel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Button
              variant="outline"
              className="border-orange-500 text-orange-500 hover:bg-orange-500/10"
              onClick={() => setClearSessionDialogOpen(true)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Clear Session
            </Button>
            <p className="text-xs text-muted-foreground">
              Use this if you&apos;re experiencing connection errors. You&apos;ll need to scan the QR code again.
            </p>
          </div>
          <div>
            <Button
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Channel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Channel</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this channel? This action cannot be undone.
              All conversations and messages associated with this channel will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Session Dialog */}
      <Dialog open={clearSessionDialogOpen} onOpenChange={setClearSessionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Session</DialogTitle>
            <DialogDescription>
              This will clear the saved WhatsApp session data. Use this if you&apos;re experiencing
              connection errors like &quot;Invalid PreKey&quot; or &quot;No session found&quot;.
              You will need to scan the QR code again to reconnect.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearSessionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => clearSessionMutation.mutate()}
              disabled={clearSessionMutation.isPending}
            >
              {clearSessionMutation.isPending ? 'Clearing...' : 'Clear Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
