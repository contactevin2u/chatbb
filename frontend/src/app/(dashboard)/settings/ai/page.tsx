'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Key,
  Clock,
  MessageSquare,
  Users,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  getAIConfig,
  updateAIConfig,
  testAIResponse,
  getAIStatus,
  type AIConfig,
  type UpdateAIConfigInput,
} from '@/lib/api/ai';

export default function AISettingsPage() {
  const queryClient = useQueryClient();

  // Form state
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [isEnabled, setIsEnabled] = useState(false);
  const [replyToAll, setReplyToAll] = useState(false);
  const [responseDelay, setResponseDelay] = useState(2000);
  const [businessHoursOnly, setBusinessHoursOnly] = useState(false);
  const [businessStart, setBusinessStart] = useState('09:00');
  const [businessEnd, setBusinessEnd] = useState('18:00');
  const [offHoursMessage, setOffHoursMessage] = useState('');
  const [handoffKeywords, setHandoffKeywords] = useState('');
  const [handoffMessage, setHandoffMessage] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Test panel state
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<{
    response: string | null;
    sources: string[];
    knowledgeFound: number;
  } | null>(null);

  // Queries
  const { data: config, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: getAIConfig,
  });

  const { data: status } = useQuery({
    queryKey: ['ai-status'],
    queryFn: getAIStatus,
    refetchInterval: 30000,
  });

  // Populate form when config loads
  useEffect(() => {
    if (config) {
      setModel(config.model || 'gpt-4o-mini');
      setIsEnabled(config.isEnabled);
      setReplyToAll(config.replyToAll);
      setResponseDelay(config.responseDelayMs);
      setBusinessHoursOnly(config.businessHoursOnly);
      setBusinessStart(config.businessStart || '09:00');
      setBusinessEnd(config.businessEnd || '18:00');
      setOffHoursMessage(config.offHoursMessage || '');
      setHandoffKeywords(config.handoffKeywords?.join(', ') || '');
      setHandoffMessage(config.handoffMessage || '');
      setSystemPrompt(config.systemPrompt || '');
      setCompanyName(config.companyName || '');
    }
  }, [config]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: updateAIConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] });
      queryClient.invalidateQueries({ queryKey: ['ai-status'] });
      toast.success('AI settings saved');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save settings');
    },
  });

  const testMutation = useMutation({
    mutationFn: testAIResponse,
    onSuccess: (result) => {
      setTestResult(result);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to test AI');
    },
  });

  // Handlers
  const handleSave = () => {
    const data: UpdateAIConfigInput = {
      model,
      isEnabled,
      replyToAll,
      responseDelayMs: responseDelay,
      businessHoursOnly,
      businessStart: businessHoursOnly ? businessStart : undefined,
      businessEnd: businessHoursOnly ? businessEnd : undefined,
      offHoursMessage: businessHoursOnly ? offHoursMessage : undefined,
      handoffKeywords: handoffKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      handoffMessage: handoffMessage || undefined,
      systemPrompt: systemPrompt || undefined,
      companyName: companyName || undefined,
    };

    // Only include API key if it was changed (not masked)
    if (apiKey && !apiKey.startsWith('sk-...')) {
      data.openaiApiKey = apiKey;
    }

    updateMutation.mutate(data);
  };

  const handleTest = () => {
    if (!testMessage.trim()) {
      toast.error('Please enter a test message');
      return;
    }
    setTestResult(null);
    testMutation.mutate(testMessage);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Auto-Reply Settings</h1>
          <p className="text-muted-foreground">
            Configure AI-powered automatic responses for customer messages
          </p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : null}
          Save Settings
        </Button>
      </div>

      {/* Status Banner */}
      {status && (
        <Card className={status.enabled ? 'border-green-500/50' : 'border-yellow-500/50'}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {status.enabled ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium">
                    AI Auto-Reply is {status.enabled ? 'Active' : 'Inactive'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {status.configured
                      ? status.withinBusinessHours
                        ? 'Within business hours - AI will respond to messages'
                        : 'Outside business hours'
                      : 'API key not configured'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status.configured && (
                  <Badge variant="outline">{status.model}</Badge>
                )}
                <Badge variant={status.replyToAll ? 'default' : 'secondary'}>
                  {status.replyToAll ? 'All Messages' : 'Unassigned Only'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left Column - Settings */}
        <div className="space-y-6">
          {/* OpenAI Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                OpenAI Configuration
              </CardTitle>
              <CardDescription>
                Configure your OpenAI API credentials
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={apiKey || config?.openaiApiKey || ''}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <p className="text-xs text-muted-foreground">
                  Get your API key from{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    platform.openai.com
                  </a>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4o-mini">GPT-4o Mini (Recommended)</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o (Most Capable)</SelectItem>
                    <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                    <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo (Cheapest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Auto-Reply Behavior */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Auto-Reply Behavior
              </CardTitle>
              <CardDescription>
                Control when and how AI responds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable AI Auto-Reply</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically respond to incoming messages
                  </p>
                </div>
                <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Reply to All Messages</Label>
                  <p className="text-sm text-muted-foreground">
                    {replyToAll
                      ? 'AI replies even when agent is assigned'
                      : 'AI only replies to unassigned conversations'}
                  </p>
                </div>
                <Switch checked={replyToAll} onCheckedChange={setReplyToAll} />
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Response Delay</Label>
                  <span className="text-sm text-muted-foreground">
                    {(responseDelay / 1000).toFixed(1)}s
                  </span>
                </div>
                <Slider
                  value={[responseDelay]}
                  onValueChange={([v]) => setResponseDelay(v)}
                  min={0}
                  max={10000}
                  step={500}
                />
                <p className="text-xs text-muted-foreground">
                  Add a human-like delay before AI responds
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Business Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Business Hours
              </CardTitle>
              <CardDescription>
                Only auto-reply during business hours (Malaysia time UTC+8)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Enable Business Hours</Label>
                <Switch
                  checked={businessHoursOnly}
                  onCheckedChange={setBusinessHoursOnly}
                />
              </div>

              {businessHoursOnly && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={businessStart}
                        onChange={(e) => setBusinessStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={businessEnd}
                        onChange={(e) => setBusinessEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Off-Hours Message</Label>
                    <Textarea
                      value={offHoursMessage}
                      onChange={(e) => setOffHoursMessage(e.target.value)}
                      placeholder="Thank you for your message. Our office hours are Mon-Fri 9am-6pm. We'll get back to you soon!"
                      rows={3}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Handoff Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Human Handoff
              </CardTitle>
              <CardDescription>
                When to transfer conversation to a human agent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Handoff Keywords</Label>
                <Input
                  value={handoffKeywords}
                  onChange={(e) => setHandoffKeywords(e.target.value)}
                  placeholder="speak to human, agent, help, talk to someone"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated keywords that trigger human handoff
                </p>
              </div>

              <div className="space-y-2">
                <Label>Handoff Message</Label>
                <Textarea
                  value={handoffMessage}
                  onChange={(e) => setHandoffMessage(e.target.value)}
                  placeholder="I'll connect you with our team. Please wait a moment."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* System Prompt */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                AI Personality
              </CardTitle>
              <CardDescription>
                Customize how AI responds to customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Name</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Medical Supplies Sdn Bhd"
                />
              </div>

              <div className="space-y-2">
                <Label>System Prompt (Advanced)</Label>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Leave empty for default prompt. Custom instructions for AI behavior..."
                  rows={6}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use default medical device sales assistant prompt
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Test Panel */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Test AI Response
              </CardTitle>
              <CardDescription>
                Send a test message to see how AI responds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Test Message</Label>
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Do you have blood pressure monitors in stock?"
                  rows={3}
                />
              </div>

              <Button
                onClick={handleTest}
                disabled={testMutation.isPending || !status?.configured}
                className="w-full"
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Test
              </Button>

              {!status?.configured && (
                <p className="text-sm text-yellow-500 text-center">
                  Configure API key first to test
                </p>
              )}

              {testResult && (
                <div className="space-y-3 mt-4">
                  <Separator />
                  <div>
                    <Label className="text-xs text-muted-foreground">AI Response</Label>
                    <div className="mt-1 p-3 bg-muted rounded-lg">
                      <p className="text-sm whitespace-pre-wrap">
                        {testResult.response || 'No response generated'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Knowledge items found: {testResult.knowledgeFound}</span>
                    {testResult.sources.length > 0 && (
                      <span>Sources: {testResult.sources.join(', ')}</span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>1.</strong> Add product info and FAQs in the{' '}
                <a href="/knowledge" className="text-primary hover:underline">
                  Knowledge Bank
                </a>
              </p>
              <p>
                <strong>2.</strong> Use specific keywords in your knowledge items
                for better AI matching
              </p>
              <p>
                <strong>3.</strong> Test different customer questions to fine-tune
                your knowledge base
              </p>
              <p>
                <strong>4.</strong> Monitor conversations to see AI performance
                and adjust as needed
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
