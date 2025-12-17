# AI Auto-Reply System - Simple OpenAI Implementation
## Malaysian Medical Device Equipment Supplier

---

## Overview

Simple approach using **OpenAI API only**:
1. **Knowledge Bank** - Store text content, FAQs, product info in database
2. **AI Auto-Reply** - Send context + user message to OpenAI, get response
3. No vector databases, no embeddings, no complex RAG

---

## Architecture

```
Customer Message
      │
      ▼
┌─────────────────┐
│ Search Keywords │  ──► Find matching products/FAQs
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Build Prompt    │  ──► System prompt + Knowledge context + User message
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OpenAI API      │  ──► gpt-4o-mini
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Send Response   │  ──► WhatsApp
└─────────────────┘
```

---

## Database Schema

```prisma
// Add to backend/prisma/schema.prisma

// ==================== KNOWLEDGE BANK ====================

model KnowledgeItem {
  id             String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String            @map("organization_id") @db.Uuid
  type           KnowledgeType
  title          String
  content        String            @db.Text    // Main content for AI
  keywords       String[]                      // For simple search matching
  category       String?
  isActive       Boolean           @default(true) @map("is_active")
  priority       Int               @default(0)   // Higher = more important
  createdAt      DateTime          @default(now()) @map("created_at")
  updatedAt      DateTime          @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([type])
  @@index([keywords])
  @@map("knowledge_items")
}

enum KnowledgeType {
  FAQ           // Question & Answer
  PRODUCT       // Product information
  POLICY        // Company policies, warranty, returns
  GENERAL       // General information
}

model AIConfig {
  id                  String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId      String        @unique @map("organization_id") @db.Uuid

  // OpenAI
  openaiApiKey        String?       @map("openai_api_key")
  model               String        @default("gpt-4o-mini")

  // Auto-Reply Settings
  isEnabled           Boolean       @default(false) @map("is_enabled")
  replyToAll          Boolean       @default(false) @map("reply_to_all")      // true = all, false = unassigned only
  responseDelayMs     Int           @default(2000) @map("response_delay_ms")  // Human-like delay

  // Business Hours (Malaysia Time UTC+8)
  businessHoursOnly   Boolean       @default(false) @map("business_hours_only")
  businessStart       String?       @map("business_start")  // "09:00"
  businessEnd         String?       @map("business_end")    // "18:00"
  offHoursMessage     String?       @map("off_hours_message")

  // Handoff
  handoffKeywords     String[]      @map("handoff_keywords")  // ["agent", "human", "help"]
  handoffMessage      String?       @map("handoff_message")

  // Prompt
  systemPrompt        String?       @map("system_prompt") @db.Text
  companyName         String?       @map("company_name")

  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("ai_configs")
}

// Add to Organization model:
// knowledgeItems  KnowledgeItem[]
// aiConfig        AIConfig?

// Add to Message model:
// isAIGenerated   Boolean  @default(false) @map("is_ai_generated")
```

---

## Backend Implementation

### File Structure

```
backend/src/modules/
├── knowledge/
│   ├── knowledge.controller.ts
│   ├── knowledge.service.ts
│   └── knowledge.routes.ts
└── ai/
    ├── ai.controller.ts
    ├── ai.service.ts
    ├── ai.routes.ts
    └── auto-reply.handler.ts
```

### Knowledge Service

```typescript
// backend/src/modules/knowledge/knowledge.service.ts

import { PrismaClient, KnowledgeType } from '@prisma/client';

export class KnowledgeService {
  constructor(private prisma: PrismaClient) {}

  async search(organizationId: string, query: string, limit = 5) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    // Simple keyword matching
    const items = await this.prisma.knowledgeItem.findMany({
      where: {
        organizationId,
        isActive: true,
        OR: [
          { keywords: { hasSome: words } },
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { priority: 'desc' },
      take: limit,
    });

    return items;
  }

  async getAllForContext(organizationId: string, type?: KnowledgeType) {
    return this.prisma.knowledgeItem.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(type && { type }),
      },
      orderBy: { priority: 'desc' },
      take: 20, // Limit to avoid token overflow
    });
  }

  // CRUD operations
  async create(organizationId: string, data: CreateKnowledgeInput) {
    return this.prisma.knowledgeItem.create({
      data: { ...data, organizationId },
    });
  }

  async update(id: string, data: UpdateKnowledgeInput) {
    return this.prisma.knowledgeItem.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.knowledgeItem.delete({ where: { id } });
  }

  async list(organizationId: string, type?: KnowledgeType) {
    return this.prisma.knowledgeItem.findMany({
      where: { organizationId, ...(type && { type }) },
      orderBy: [{ type: 'asc' }, { priority: 'desc' }, { title: 'asc' }],
    });
  }
}
```

### AI Service

```typescript
// backend/src/modules/ai/ai.service.ts

import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { KnowledgeService } from '../knowledge/knowledge.service';

export class AIService {
  private knowledgeService: KnowledgeService;

  constructor(private prisma: PrismaClient) {
    this.knowledgeService = new KnowledgeService(prisma);
  }

  async generateResponse(
    organizationId: string,
    conversationId: string,
    userMessage: string
  ): Promise<{ response: string | null; shouldHandoff: boolean }> {

    // 1. Get AI config
    const config = await this.prisma.aIConfig.findUnique({
      where: { organizationId },
    });

    if (!config?.isEnabled || !config?.openaiApiKey) {
      return { response: null, shouldHandoff: true };
    }

    // 2. Check handoff keywords
    const messageLower = userMessage.toLowerCase();
    const shouldHandoff = config.handoffKeywords?.some(kw =>
      messageLower.includes(kw.toLowerCase())
    );

    if (shouldHandoff) {
      return {
        response: config.handoffMessage || "I'll connect you with our team. Please wait.",
        shouldHandoff: true,
      };
    }

    // 3. Get relevant knowledge
    const relevantItems = await this.knowledgeService.search(organizationId, userMessage);
    const knowledgeContext = this.buildKnowledgeContext(relevantItems);

    // 4. Get conversation history
    const history = await this.getConversationHistory(conversationId, 6);

    // 5. Build system prompt
    const systemPrompt = this.buildSystemPrompt(config, knowledgeContext);

    // 6. Call OpenAI
    const openai = new OpenAI({ apiKey: config.openaiApiKey });

    const completion = await openai.chat.completions.create({
      model: config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return {
      response: completion.choices[0]?.message?.content || null,
      shouldHandoff: false,
    };
  }

  private buildKnowledgeContext(items: any[]): string {
    if (items.length === 0) return '';

    const sections = items.map(item => {
      if (item.type === 'FAQ') {
        return `Q: ${item.title}\nA: ${item.content}`;
      }
      if (item.type === 'PRODUCT') {
        return `Product: ${item.title}\n${item.content}`;
      }
      return `${item.title}: ${item.content}`;
    });

    return sections.join('\n\n');
  }

  private buildSystemPrompt(config: any, knowledge: string): string {
    const companyName = config.companyName || 'our company';

    const defaultPrompt = `You are a helpful sales assistant for ${companyName}, a medical device equipment supplier in Malaysia.

ROLE:
- Answer product inquiries
- Provide pricing information (always mention "subject to confirmation")
- Explain product specifications
- Help with availability questions

RULES:
1. Be professional and helpful
2. Only answer based on the provided knowledge
3. If unsure, say "Let me connect you with our team for more details"
4. Keep responses concise (2-3 sentences max)
5. Use MYR for pricing
6. Mention certifications when relevant (MDA, ISO, CE)`;

    const systemPrompt = config.systemPrompt || defaultPrompt;

    if (knowledge) {
      return `${systemPrompt}\n\n--- KNOWLEDGE BASE ---\n${knowledge}\n--- END KNOWLEDGE ---`;
    }

    return systemPrompt;
  }

  private async getConversationHistory(conversationId: string, limit: number) {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { direction: true, content: true },
    });

    return messages.reverse().map(m => ({
      role: m.direction === 'INBOUND' ? 'user' : 'assistant',
      content: (m.content as any)?.text || '',
    })).filter(m => m.content);
  }

  async getConfig(organizationId: string) {
    return this.prisma.aIConfig.findUnique({ where: { organizationId } });
  }

  async updateConfig(organizationId: string, data: any) {
    return this.prisma.aIConfig.upsert({
      where: { organizationId },
      update: data,
      create: { organizationId, ...data },
    });
  }
}
```

### Auto-Reply Handler

```typescript
// backend/src/modules/ai/auto-reply.handler.ts

import { AIService } from './ai.service';
import { MessageService } from '../message/message.service';
import { PrismaClient } from '@prisma/client';

export class AutoReplyHandler {
  private aiService: AIService;
  private messageService: MessageService;

  constructor(private prisma: PrismaClient) {
    this.aiService = new AIService(prisma);
  }

  async handleIncomingMessage(conversationId: string, message: any): Promise<void> {
    // Only process inbound text messages
    if (message.direction !== 'INBOUND' || message.type !== 'TEXT') {
      return;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { channel: true },
    });

    if (!conversation) return;

    const organizationId = conversation.channel.organizationId;
    const config = await this.aiService.getConfig(organizationId);

    // Check if AI is enabled
    if (!config?.isEnabled) return;

    // Check if should reply (all messages or unassigned only)
    if (!config.replyToAll && conversation.assignedUserId) {
      return; // Agent assigned, don't auto-reply
    }

    // Check business hours
    if (config.businessHoursOnly && !this.isBusinessHours(config)) {
      if (config.offHoursMessage) {
        await this.sendMessage(conversationId, config.offHoursMessage, true);
      }
      return;
    }

    // Add human-like delay
    await this.delay(config.responseDelayMs || 2000);

    // Generate AI response
    const userText = (message.content as any)?.text || '';
    const { response, shouldHandoff } = await this.aiService.generateResponse(
      organizationId,
      conversationId,
      userText
    );

    if (response) {
      await this.sendMessage(conversationId, response, true);
    }

    if (shouldHandoff) {
      // Optionally notify team or change conversation status
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { status: 'PENDING' }, // Mark for human attention
      });
    }
  }

  private isBusinessHours(config: any): boolean {
    const now = new Date();
    // Convert to Malaysia time (UTC+8)
    const malaysiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    const hours = malaysiaTime.getHours();
    const minutes = malaysiaTime.getMinutes();
    const currentTime = hours * 60 + minutes;

    const [startH, startM] = (config.businessStart || '09:00').split(':').map(Number);
    const [endH, endM] = (config.businessEnd || '18:00').split(':').map(Number);

    const startTime = startH * 60 + startM;
    const endTime = endH * 60 + endM;

    // Check if weekend
    const day = malaysiaTime.getDay();
    if (day === 0 || day === 6) return false; // Sunday = 0, Saturday = 6

    return currentTime >= startTime && currentTime <= endTime;
  }

  private async sendMessage(conversationId: string, text: string, isAI: boolean) {
    // Use existing message service to send via WhatsApp
    await this.messageService.sendMessage({
      conversationId,
      content: { text },
      isAIGenerated: isAI,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Integrate with Worker

```typescript
// In backend/src/workers/index.ts
// Add after saving incoming message:

import { AutoReplyHandler } from '../modules/ai/auto-reply.handler';

// Inside processIncomingMessage, after message is saved:
const autoReplyHandler = new AutoReplyHandler(prisma);
await autoReplyHandler.handleIncomingMessage(conversation.id, savedMessage);
```

---

## API Routes

```typescript
// backend/src/modules/knowledge/knowledge.routes.ts

router.get('/', listKnowledge);           // List all knowledge items
router.post('/', createKnowledge);        // Create knowledge item
router.patch('/:id', updateKnowledge);    // Update knowledge item
router.delete('/:id', deleteKnowledge);   // Delete knowledge item

// backend/src/modules/ai/ai.routes.ts

router.get('/config', getAIConfig);       // Get AI settings
router.patch('/config', updateAIConfig);  // Update AI settings
router.post('/test', testAIResponse);     // Test AI with sample message
```

---

## Frontend Pages

### 1. Knowledge Bank Page

```
/knowledge - Manage knowledge items

Features:
- Tabs: All | FAQs | Products | Policies | General
- Add/Edit/Delete items
- Each item has: Title, Content, Keywords, Category, Priority
- Toggle active/inactive
- Search/filter
```

### 2. AI Settings Page

```
/settings/ai - Configure AI auto-reply

Sections:
1. Enable/Disable toggle
2. OpenAI API Key input
3. Reply mode: All messages / Unassigned only
4. Response delay slider
5. Business hours toggle + time pickers
6. Off-hours message
7. Handoff keywords
8. System prompt editor
9. Test panel (send test message, see response)
```

---

## Sample Knowledge Items

### FAQs

```json
{
  "type": "FAQ",
  "title": "What are your payment terms?",
  "content": "We accept bank transfer (TT), credit card, and for established customers, 30-day credit terms. All prices are in MYR and subject to 6% SST.",
  "keywords": ["payment", "pay", "credit", "terms", "bank", "transfer"],
  "category": "Payment",
  "priority": 10
}
```

### Products

```json
{
  "type": "PRODUCT",
  "title": "Digital Blood Pressure Monitor BPM-X100",
  "content": "Automatic digital blood pressure monitor with LCD display. Features: Arm-type, 60 memory storage, irregular heartbeat detection. Price: RM 280/unit. MOQ: 5 units. MDA registered. CE certified. 1 year warranty.",
  "keywords": ["blood pressure", "bp monitor", "bpm", "sphygmomanometer", "hypertension"],
  "category": "Diagnostic Equipment",
  "priority": 5
}
```

### Policies

```json
{
  "type": "POLICY",
  "title": "Warranty Policy",
  "content": "All equipment comes with manufacturer warranty (typically 1-2 years). Warranty covers manufacturing defects only. Does not cover misuse, accidents, or unauthorized modifications. Service available nationwide.",
  "keywords": ["warranty", "guarantee", "repair", "service", "defect"],
  "category": "After Sales",
  "priority": 8
}
```

---

## Default System Prompt

```
You are a sales assistant for [Company Name], a medical device equipment supplier in Malaysia.

YOUR JOB:
- Answer product questions
- Provide pricing (always say "subject to confirmation")
- Explain specifications and certifications
- Help with stock availability

RULES:
1. Be professional and concise
2. Only use information from the knowledge base
3. If you don't know, say "Let me check with our team and get back to you"
4. Keep responses short (2-3 sentences)
5. Use MYR for all prices
6. Mention relevant certifications (MDA, ISO 13485, CE)

NEVER:
- Make up product information
- Give medical advice
- Promise specific delivery dates without checking
- Share competitor information
```

---

## Implementation Steps

| Step | Task | Time |
|------|------|------|
| 1 | Add Prisma schema (KnowledgeItem, AIConfig) | 1 day |
| 2 | Create Knowledge service & routes | 1 day |
| 3 | Create AI service & auto-reply handler | 2 days |
| 4 | Integrate with message worker | 1 day |
| 5 | Frontend - Knowledge Bank page | 2 days |
| 6 | Frontend - AI Settings page | 1 day |
| 7 | Testing & prompt tuning | 1 day |
| **Total** | | **~9 days** |

---

## Dependencies

```bash
npm install openai
```

That's it. Just one new dependency.

---

## Cost Estimate

**gpt-4o-mini pricing:**
- Input: $0.15 / 1M tokens
- Output: $0.60 / 1M tokens

**Example:** 1000 conversations/month, ~500 tokens each
- ~500K tokens = ~$0.30/month

**Very cheap** - probably under RM 5/month for moderate usage.

---

## Summary

This simple approach:
- ✅ Uses OpenAI API directly
- ✅ No vector database needed
- ✅ No embeddings needed
- ✅ Simple keyword search for knowledge
- ✅ Easy to maintain
- ✅ Low cost (~RM 5/month)
- ✅ Fast to implement (~9 days)
