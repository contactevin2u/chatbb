'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Plus,
  MessageSquare,
  Wifi,
  WifiOff,
  AlertCircle,
  MoreVertical,
  Trash2,
  Settings,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  listWhatsAppChannels,
  createWhatsAppChannel,
  deleteWhatsAppChannel,
  type Channel,
} from '@/lib/api/channels';

const statusConfig = {
  CONNECTED: {
    label: 'Connected',
    icon: Wifi,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  DISCONNECTED: {
    label: 'Disconnected',
    icon: WifiOff,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
  CONNECTING: {
    label: 'Connecting',
    icon: RefreshCw,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  ERROR: {
    label: 'Error',
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  BANNED: {
    label: 'Banned',
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
};

function ChannelCard({ channel, onDelete }: { channel: Channel; onDelete: () => void }) {
  const status = statusConfig[channel.status] || statusConfig.DISCONNECTED;
  const StatusIcon = status.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <CardTitle className="text-base">{channel.name}</CardTitle>
            <CardDescription className="text-sm">
              {channel.identifier !== 'pending' ? `+${channel.identifier}` : 'Not connected'}
            </CardDescription>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/channels/whatsapp/${channel.id}`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-2 text-sm ${status.color}`}>
            <StatusIcon className={`h-4 w-4 ${channel.status === 'CONNECTING' ? 'animate-spin' : ''}`} />
            {status.label}
          </div>
          {channel.status === 'DISCONNECTED' && (
            <Button asChild size="sm">
              <Link href={`/channels/whatsapp/${channel.id}/connect`}>Connect</Link>
            </Button>
          )}
          {channel.status === 'CONNECTED' && (
            <span className="text-xs text-muted-foreground">
              Last active:{' '}
              {channel.lastConnectedAt
                ? new Date(channel.lastConnectedAt).toLocaleDateString()
                : 'Never'}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ChannelsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const queryClient = useQueryClient();

  const { data: channels, isLoading } = useQuery({
    queryKey: ['whatsapp-channels'],
    queryFn: listWhatsAppChannels,
  });

  const createMutation = useMutation({
    mutationFn: createWhatsAppChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-channels'] });
      setCreateDialogOpen(false);
      setNewChannelName('');
      toast.success('Channel created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create channel');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteWhatsAppChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-channels'] });
      toast.success('Channel deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete channel');
    },
  });

  const handleCreate = () => {
    if (!newChannelName.trim()) {
      toast.error('Please enter a channel name');
      return;
    }
    createMutation.mutate({ name: newChannelName.trim() });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Channels</h1>
          <p className="text-muted-foreground">
            Manage your connected messaging channels
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add WhatsApp Channel</DialogTitle>
              <DialogDescription>
                Create a new WhatsApp channel to connect your phone number.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="channel-name">Channel Name</Label>
                <Input
                  id="channel-name"
                  placeholder="e.g., Sales WhatsApp"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Channel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Channels Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted rounded" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-4 w-20 bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : channels?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No channels yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Get started by adding your first WhatsApp channel.
            </p>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Channel
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {channels?.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onDelete={() => deleteMutation.mutate(channel.id)}
            />
          ))}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Coming Soon: TikTok DM</CardTitle>
            <CardDescription>
              Connect your TikTok business account to manage direct messages.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Coming Soon: Instagram DM</CardTitle>
            <CardDescription>
              Connect your Instagram business account to manage direct messages.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
