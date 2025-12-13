'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft,
  Smartphone,
  QrCode,
  Check,
  Loader2,
  RefreshCw,
  Phone,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWebSocket } from '@/providers/websocket-provider';
import {
  getWhatsAppChannelStatus,
  connectWhatsAppChannel,
  requestPairingCode,
} from '@/lib/api/channels';

type ConnectionStatus = 'idle' | 'connecting' | 'scanning' | 'connected' | 'error';

export default function ConnectWhatsAppPage() {
  const params = useParams();
  const router = useRouter();
  const channelId = params.channelId as string;

  const { socket, subscribeToChannel, unsubscribeFromChannel } = useWebSocket();

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');

  // Get channel status
  const { data: channelStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['channel-status', channelId],
    queryFn: () => getWhatsAppChannelStatus(channelId),
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: () => connectWhatsAppChannel(channelId),
    onSuccess: (data) => {
      setConnectionStatus('scanning');
      if (data.qrCode) {
        setQrCode(data.qrCode);
      }
    },
    onError: (error: Error) => {
      setConnectionStatus('error');
      toast.error(error.message || 'Failed to connect');
    },
  });

  // Pairing code mutation
  const pairingMutation = useMutation({
    mutationFn: (phone: string) => requestPairingCode(channelId, phone),
    onSuccess: (data) => {
      setConnectionStatus('scanning');
      setPairingCode(data.pairingCode);
      toast.success('Pairing code generated! Enter it in WhatsApp.');
    },
    onError: (error: Error) => {
      setConnectionStatus('error');
      toast.error(error.message || 'Failed to generate pairing code');
    },
  });

  // Subscribe to channel updates via WebSocket
  useEffect(() => {
    if (!socket || !channelId) return;

    subscribeToChannel(channelId);

    // Listen for QR code updates
    const handleQr = (data: { channelId: string; qr: string }) => {
      if (data.channelId === channelId) {
        setQrCode(data.qr);
        setConnectionStatus('scanning');
      }
    };

    // Listen for pairing code
    const handlePairingCode = (data: { channelId: string; code: string }) => {
      if (data.channelId === channelId) {
        setPairingCode(data.code);
        setConnectionStatus('scanning');
      }
    };

    // Listen for connection success
    const handleConnected = (data: { channelId: string; phoneNumber: string }) => {
      if (data.channelId === channelId) {
        setConnectionStatus('connected');
        toast.success(`Connected to +${data.phoneNumber}`);
        // Redirect after a short delay
        setTimeout(() => {
          router.push('/channels');
        }, 2000);
      }
    };

    // Listen for disconnection
    const handleDisconnected = (data: { channelId: string; reason: string }) => {
      if (data.channelId === channelId) {
        // Code 515 "restartRequired" is expected after QR scan - ignore it
        if (data.reason === 'restartRequired' || data.reason === '515') {
          console.log('Connection restarting after pairing (expected)');
          return;
        }
        setConnectionStatus('error');
        toast.error(`Disconnected: ${data.reason}`);
      }
    };

    socket.on('whatsapp:qr', handleQr);
    socket.on('whatsapp:pairing-code', handlePairingCode);
    socket.on('whatsapp:connected', handleConnected);
    socket.on('whatsapp:disconnected', handleDisconnected);

    return () => {
      unsubscribeFromChannel(channelId);
      socket.off('whatsapp:qr', handleQr);
      socket.off('whatsapp:pairing-code', handlePairingCode);
      socket.off('whatsapp:connected', handleConnected);
      socket.off('whatsapp:disconnected', handleDisconnected);
    };
  }, [socket, channelId, subscribeToChannel, unsubscribeFromChannel, router]);

  // Check if already connected
  useEffect(() => {
    if (channelStatus?.status === 'CONNECTED') {
      setConnectionStatus('connected');
    }
  }, [channelStatus]);

  const handleStartQrConnection = useCallback(() => {
    setConnectionStatus('connecting');
    setQrCode(null);
    setPairingCode(null);
    connectMutation.mutate();
  }, [connectMutation]);

  const handleRequestPairingCode = useCallback(() => {
    if (!phoneNumber.trim()) {
      toast.error('Please enter your phone number');
      return;
    }
    setConnectionStatus('connecting');
    setQrCode(null);
    setPairingCode(null);
    pairingMutation.mutate(phoneNumber);
  }, [phoneNumber, pairingMutation]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Back button */}
      <Link
        href="/channels"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Channels
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Connect WhatsApp</CardTitle>
          <CardDescription>
            Link your WhatsApp account to start receiving and sending messages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {connectionStatus === 'connected' ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-16 w-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Connected!</h3>
              <p className="text-muted-foreground text-center">
                Your WhatsApp is now linked. Redirecting to channels...
              </p>
            </div>
          ) : (
            <Tabs defaultValue="qr" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="qr">
                  <QrCode className="mr-2 h-4 w-4" />
                  QR Code
                </TabsTrigger>
                <TabsTrigger value="pairing">
                  <Phone className="mr-2 h-4 w-4" />
                  Pairing Code
                </TabsTrigger>
              </TabsList>

              <TabsContent value="qr" className="space-y-4">
                <div className="text-center py-4">
                  {connectionStatus === 'idle' && (
                    <>
                      <div className="h-64 w-64 mx-auto border-2 border-dashed rounded-lg flex items-center justify-center mb-4">
                        <QrCode className="h-16 w-16 text-muted-foreground" />
                      </div>
                      <Button onClick={handleStartQrConnection}>
                        Generate QR Code
                      </Button>
                    </>
                  )}

                  {connectionStatus === 'connecting' && (
                    <div className="h-64 w-64 mx-auto border rounded-lg flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  )}

                  {connectionStatus === 'scanning' && qrCode && (
                    <>
                      <div className="h-64 w-64 mx-auto bg-white p-4 rounded-lg">
                        <QRCodeSVG
                          value={qrCode}
                          size={224}
                          level="M"
                          includeMargin
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mt-4">
                        Scan this QR code with your WhatsApp app
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={handleStartQrConnection}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh QR Code
                      </Button>
                    </>
                  )}

                  {connectionStatus === 'error' && (
                    <>
                      <div className="h-64 w-64 mx-auto border rounded-lg flex flex-col items-center justify-center text-destructive">
                        <span className="text-4xl mb-2">!</span>
                        <p>Connection failed</p>
                      </div>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={handleStartQrConnection}
                      >
                        Try Again
                      </Button>
                    </>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">How to connect:</h4>
                  <ol className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="font-medium">1.</span>
                      Open WhatsApp on your phone
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">2.</span>
                      Go to Settings {'->'} Linked Devices
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">3.</span>
                      Tap &quot;Link a Device&quot;
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">4.</span>
                      Point your phone at this QR code
                    </li>
                  </ol>
                </div>
              </TabsContent>

              <TabsContent value="pairing" className="space-y-4">
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+1234567890"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter your full phone number with country code
                    </p>
                  </div>

                  {pairingCode ? (
                    <div className="bg-muted p-6 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground mb-2">
                        Your pairing code:
                      </p>
                      <p className="text-3xl font-mono font-bold tracking-widest">
                        {pairingCode}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Enter this code in WhatsApp
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={handleRequestPairingCode}
                      disabled={pairingMutation.isPending}
                      className="w-full"
                    >
                      {pairingMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Get Pairing Code'
                      )}
                    </Button>
                  )}
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">How to connect with pairing code:</h4>
                  <ol className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="font-medium">1.</span>
                      Open WhatsApp on your phone
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">2.</span>
                      Go to Settings {'->'} Linked Devices
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">3.</span>
                      Tap &quot;Link a Device&quot;
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">4.</span>
                      Select &quot;Link with phone number instead&quot;
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">5.</span>
                      Enter the pairing code shown above
                    </li>
                  </ol>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
