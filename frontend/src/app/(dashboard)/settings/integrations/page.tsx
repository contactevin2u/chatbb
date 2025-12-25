'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Webhook,
  Send,
  Copy,
  CheckCircle,
  Loader2,
  FileText,
  Image,
  Video,
  Music,
  ExternalLink,
  AlertCircle,
  Code,
  BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { listChannels, Channel } from '@/lib/api/channels';

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function IntegrationsPage() {
  // State for test form
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [recipient, setRecipient] = useState<string>('');
  const [messageType, setMessageType] = useState<'text' | 'media'>('text');
  const [message, setMessage] = useState<string>('');
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'audio' | 'document'>('image');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaCaption, setMediaCaption] = useState<string>('');
  const [mediaFilename, setMediaFilename] = useState<string>('');
  const [copied, setCopied] = useState<string | null>(null);

  // Fetch channels for dropdown
  const { data: channels, isLoading: channelsLoading } = useQuery({
    queryKey: ['channels'],
    queryFn: listChannels,
  });

  // Filter to only WhatsApp channels
  const whatsappChannels = channels?.filter(
    (ch: Channel) => ch.type === 'WHATSAPP' && ch.status === 'CONNECTED'
  ) || [];

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  // Generate example request
  const generateExampleRequest = () => {
    const baseRequest: any = {
      channel_id: selectedChannel || '<channel-uuid>',
      to: recipient || '120363123456789@g.us',
    };

    if (messageType === 'text') {
      baseRequest.message = message || 'Hello from ChatBaby!';
    } else {
      baseRequest.media = {
        type: mediaType,
        url: mediaUrl || 'https://example.com/file.' + (mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'mp3' : 'pdf'),
      };
      if (mediaCaption) baseRequest.media.caption = mediaCaption;
      if (mediaFilename && mediaType === 'document') baseRequest.media.filename = mediaFilename;
    }

    return JSON.stringify(baseRequest, null, 2);
  };

  // Generate curl command
  const generateCurlCommand = () => {
    const request = generateExampleRequest();
    return `curl -X POST ${API_BASE_URL}/api/v1/notifications/send \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '${request.replace(/\n/g, '\\n').replace(/'/g, "\\'")}'`;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Webhook className="h-6 w-6" />
            Integrations & API
          </h1>
          <p className="text-muted-foreground">
            Connect external systems to ChatBaby via webhooks and APIs
          </p>
        </div>
      </div>

      {/* Status Banner */}
      <Card className="border-hotpink-500/20 bg-hotpink-500/5">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="p-2 rounded-full bg-hotpink-500/10">
            <Send className="h-5 w-5 text-hotpink-500" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Notification API</h3>
            <p className="text-sm text-muted-foreground">
              Send WhatsApp messages from external systems like Autocount, ERPs, or custom apps
            </p>
          </div>
          <Badge variant="outline" className="border-green-500 text-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            Available
          </Badge>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Left Column - Configuration */}
        <div className="md:col-span-2 space-y-6">
          {/* API Endpoint Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                API Endpoint
              </CardTitle>
              <CardDescription>
                Use this endpoint to send notifications from your external systems
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Endpoint URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={`${API_BASE_URL}/api/v1/notifications/send`}
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(`${API_BASE_URL}/api/v1/notifications/send`, 'URL')}
                  >
                    {copied === 'URL' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>HTTP Method</Label>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500">POST</Badge>
                  <span className="text-sm text-muted-foreground">
                    Content-Type: application/json
                  </span>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Authentication</Label>
                <p className="text-sm text-muted-foreground">
                  Include your API key in the request header:
                </p>
                <div className="bg-muted p-3 rounded-md font-mono text-sm">
                  X-API-Key: YOUR_NOTIFICATION_API_KEY
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Contact your administrator to get your API key
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Request Builder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Request Builder
              </CardTitle>
              <CardDescription>
                Build and preview your API request
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Channel Selection */}
              <div className="space-y-2">
                <Label>WhatsApp Channel</Label>
                <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a connected channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {channelsLoading ? (
                      <SelectItem value="loading" disabled>Loading...</SelectItem>
                    ) : whatsappChannels.length === 0 ? (
                      <SelectItem value="none" disabled>No connected channels</SelectItem>
                    ) : (
                      whatsappChannels.map((channel: Channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.name} ({channel.identifier})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The channel_id to use in your API request
                </p>
              </div>

              {/* Recipient */}
              <div className="space-y-2">
                <Label>Recipient (to)</Label>
                <Input
                  placeholder="120363123456789@g.us or +60123456789"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Group JID (ending in @g.us) or phone number with country code
                </p>
              </div>

              {/* Message Type Tabs */}
              <div className="space-y-2">
                <Label>Message Type</Label>
                <Tabs value={messageType} onValueChange={(v) => setMessageType(v as 'text' | 'media')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="text">Text Message</TabsTrigger>
                    <TabsTrigger value="media">Media Message</TabsTrigger>
                  </TabsList>
                  <TabsContent value="text" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Message</Label>
                      <Textarea
                        placeholder="Enter your message text..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="media" className="space-y-4">
                    <div className="space-y-2">
                      <Label>Media Type</Label>
                      <Select value={mediaType} onValueChange={(v) => setMediaType(v as any)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="image">
                            <div className="flex items-center gap-2">
                              <Image className="h-4 w-4" />
                              Image
                            </div>
                          </SelectItem>
                          <SelectItem value="video">
                            <div className="flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              Video
                            </div>
                          </SelectItem>
                          <SelectItem value="audio">
                            <div className="flex items-center gap-2">
                              <Music className="h-4 w-4" />
                              Audio
                            </div>
                          </SelectItem>
                          <SelectItem value="document">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Document
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Media URL</Label>
                      <Input
                        placeholder="https://example.com/image.jpg"
                        value={mediaUrl}
                        onChange={(e) => setMediaUrl(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Caption (optional)</Label>
                      <Input
                        placeholder="Optional caption for the media"
                        value={mediaCaption}
                        onChange={(e) => setMediaCaption(e.target.value)}
                      />
                    </div>
                    {mediaType === 'document' && (
                      <div className="space-y-2">
                        <Label>Filename (optional)</Label>
                        <Input
                          placeholder="document.pdf"
                          value={mediaFilename}
                          onChange={(e) => setMediaFilename(e.target.value)}
                        />
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>

              <Separator />

              {/* Generated Request */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Request Body (JSON)</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(generateExampleRequest(), 'JSON')}
                  >
                    {copied === 'JSON' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    Copy
                  </Button>
                </div>
                <pre className="bg-muted p-4 rounded-md text-sm font-mono overflow-x-auto">
                  {generateExampleRequest()}
                </pre>
              </div>

              {/* curl Command */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>curl Command</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(generateCurlCommand(), 'curl')}
                  >
                    {copied === 'curl' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
                    ) : (
                      <Copy className="h-4 w-4 mr-1" />
                    )}
                    Copy
                  </Button>
                </div>
                <pre className="bg-muted p-4 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {generateCurlCommand()}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Response Format */}
          <Card>
            <CardHeader>
              <CardTitle>Response Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Badge className="bg-green-500">200</Badge>
                  Success Response
                </Label>
                <pre className="bg-muted p-4 rounded-md text-sm font-mono">
{`{
  "success": true,
  "message_id": "550e8400-e29b-41d4-a716-446655440000",
  "external_id": "3EB0ABC123DEF456"
}`}
                </pre>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Badge variant="destructive">4xx/5xx</Badge>
                  Error Response
                </Label>
                <pre className="bg-muted p-4 rounded-md text-sm font-mono">
{`{
  "success": false,
  "error": "Error description here"
}`}
                </pre>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>HTTP Status Codes</Label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">200</Badge>
                    <span>Success</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">400</Badge>
                    <span>Validation Error</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">401</Badge>
                    <span>Invalid API Key</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">404</Badge>
                    <span>Channel Not Found</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">429</Badge>
                    <span>Rate Limited</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">500</Badge>
                    <span>Server Error</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Quick Reference */}
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4" />
                Quick Reference
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">Required Headers</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li><code className="text-xs">Content-Type: application/json</code></li>
                  <li><code className="text-xs">X-API-Key: YOUR_KEY</code></li>
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Rate Limits</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>60 requests per minute</li>
                  <li>WhatsApp: 30 msgs/min per channel</li>
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">JID Formats</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li><strong>Groups:</strong> <code className="text-xs">120363xxx@g.us</code></li>
                  <li><strong>Users:</strong> <code className="text-xs">60123456789</code></li>
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Media Types</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li><code className="text-xs">image</code> - JPG, PNG, GIF</li>
                  <li><code className="text-xs">video</code> - MP4</li>
                  <li><code className="text-xs">audio</code> - MP3, OGG</li>
                  <li><code className="text-xs">document</code> - PDF, DOC, etc.</li>
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Get Group JID</h4>
                <p className="text-muted-foreground text-xs">
                  Check the Contact list in ChatBaby for groups, or run:
                </p>
                <pre className="bg-muted p-2 rounded text-xs mt-1 overflow-x-auto">
{`SELECT identifier
FROM "Contact"
WHERE identifier
LIKE '%@g.us'`}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Help */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Need Help?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                For API key or integration support, contact your system administrator.
              </p>
              <Button variant="outline" size="sm" className="w-full" asChild>
                <a href="mailto:support@chatbaby.app">
                  Contact Support
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
