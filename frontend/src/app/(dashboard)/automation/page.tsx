'use client';

import { Bot } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function AutomationPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Automation</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Bot className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Chatbots, auto-replies, and workflow automation with visual flow builder.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
