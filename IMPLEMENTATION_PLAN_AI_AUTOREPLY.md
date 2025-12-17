# AI Auto-Reply System with Knowledge Bank
## Malaysian Medical Device Equipment Supplier - Indoor Sales

---

## Executive Summary

This plan outlines the implementation of an AI-powered auto-reply system for a Malaysian medical device equipment supplier. The system will:

1. **Knowledge Bank** - Upload and manage product catalogs, pricing, specs, FAQs, images
2. **AI Auto-Reply** - OpenAI-powered intelligent responses using RAG (Retrieval-Augmented Generation)
3. **Indoor Sales Focus** - Handle product inquiries, pricing questions, availability, specifications

**Key Advantage**: Your codebase already uses PostgreSQL with extensions enabled - we can add `pgvector` for vector storage without adding external services.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           KNOWLEDGE BANK                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Documents   │  │   Images     │  │  Products    │  │    FAQs     │ │
│  │  (PDF, TXT)  │  │  (JPG, PNG)  │  │  (Catalog)   │  │  (Q&A)      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         └──────────────────┴─────────────────┴─────────────────┘        │
│                                    │                                     │
│                           ┌────────▼────────┐                           │
│                           │  Text Extractor │                           │
│                           │  (OCR for imgs) │                           │
│                           └────────┬────────┘                           │
│                                    │                                     │
│                           ┌────────▼────────┐                           │
│                           │  Chunking &     │                           │
│                           │  Embedding      │                           │
│                           │  (OpenAI)       │                           │
│                           └────────┬────────┘                           │
│                                    │                                     │
│                           ┌────────▼────────┐                           │
│                           │   pgvector      │                           │
│                           │   (PostgreSQL)  │                           │
│                           └─────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│                           AI AUTO-REPLY                                  │
│                                                                          │
│  Customer Message                                                        │
│        │                                                                 │
│        ▼                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Embed     │───▶│   Vector    │───▶│  Retrieve   │                 │
│  │   Query     │    │   Search    │    │  Top-K      │                 │
│  └─────────────┘    │  (pgvector) │    │  Chunks     │                 │
│                     └─────────────┘    └──────┬──────┘                 │
│                                               │                         │
│                                        ┌──────▼──────┐                 │
│                                        │   Build     │                 │
│                                        │   Prompt    │                 │
│                                        └──────┬──────┘                 │
│                                               │                         │
│                                        ┌──────▼──────┐                 │
│                                        │   OpenAI    │                 │
│                                        │   GPT-4o    │                 │
│                                        └──────┬──────┘                 │
│                                               │                         │
│                                        ┌──────▼──────┐                 │
│                                        │   Response  │                 │
│                                        │   to User   │                 │
│                                        └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema Extensions

### 1.1 Enable pgvector Extension

```prisma
// backend/prisma/schema.prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto, vector]  // Add vector extension
}
```

### 1.2 New Models

```prisma
// ==================== KNOWLEDGE BANK ====================

model KnowledgeBank {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  name           String   // "Product Catalog", "Pricing Guide", "FAQs"
  description    String?
  isActive       Boolean  @default(true) @map("is_active")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization         @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  documents    KnowledgeDocument[]
  products     Product[]

  @@index([organizationId])
  @@map("knowledge_banks")
}

model KnowledgeDocument {
  id              String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  knowledgeBankId String                @map("knowledge_bank_id") @db.Uuid
  title           String
  type            KnowledgeDocumentType
  sourceUrl       String?               @map("source_url") // Cloudinary URL
  sourceFileName  String?               @map("source_file_name")
  rawContent      String?               @map("raw_content") @db.Text // Extracted text
  metadata        Json                  @default("{}")
  status          ProcessingStatus      @default(PENDING)
  errorMessage    String?               @map("error_message")
  createdAt       DateTime              @default(now()) @map("created_at")
  updatedAt       DateTime              @updatedAt @map("updated_at")

  knowledgeBank KnowledgeBank      @relation(fields: [knowledgeBankId], references: [id], onDelete: Cascade)
  chunks        KnowledgeChunk[]

  @@index([knowledgeBankId])
  @@index([status])
  @@map("knowledge_documents")
}

enum KnowledgeDocumentType {
  TEXT        // Plain text, markdown
  PDF         // PDF documents
  IMAGE       // Product images with OCR
  SPREADSHEET // Excel/CSV price lists
  FAQ         // Q&A pairs
  PRODUCT     // Product specification
}

enum ProcessingStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model KnowledgeChunk {
  id          String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  documentId  String                      @map("document_id") @db.Uuid
  content     String                      @db.Text
  embedding   Unsupported("vector(1536)") // OpenAI embedding dimension
  chunkIndex  Int                         @map("chunk_index")
  metadata    Json                        @default("{}") // page number, section, etc.
  tokenCount  Int                         @map("token_count")
  createdAt   DateTime                    @default(now()) @map("created_at")

  document KnowledgeDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@map("knowledge_chunks")
}

// ==================== PRODUCT CATALOG ====================

model Product {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  knowledgeBankId String   @map("knowledge_bank_id") @db.Uuid
  sku             String   // Product SKU/Code
  name            String
  nameMs          String?  @map("name_ms") // Malay name
  nameCn          String?  @map("name_cn") // Chinese name
  description     String?  @db.Text
  descriptionMs   String?  @map("description_ms") @db.Text
  category        String?  // "Diagnostic Equipment", "Surgical Instruments"
  subcategory     String?
  brand           String?
  model           String?
  specifications  Json     @default("{}") // Technical specs
  price           Decimal? @db.Decimal(10, 2)
  currency        String   @default("MYR")
  priceUnit       String?  @map("price_unit") // "per unit", "per box"
  minOrderQty     Int?     @map("min_order_qty")
  inStock         Boolean  @default(true) @map("in_stock")
  leadTimeDays    Int?     @map("lead_time_days")
  imageUrls       String[] @map("image_urls")
  certifications  String[] // "MDA", "ISO 13485", "CE"
  tags            String[]
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  knowledgeBank KnowledgeBank @relation(fields: [knowledgeBankId], references: [id], onDelete: Cascade)

  @@unique([knowledgeBankId, sku])
  @@index([knowledgeBankId])
  @@index([category])
  @@index([name])
  @@map("products")
}

// ==================== AI CONFIGURATION ====================

model AIConfig {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  organizationId String   @unique @map("organization_id") @db.Uuid

  // OpenAI Settings
  openaiApiKey   String?  @map("openai_api_key") // Encrypted
  model          String   @default("gpt-4o-mini")
  temperature    Float    @default(0.7)
  maxTokens      Int      @default(500) @map("max_tokens")

  // Auto-Reply Settings
  isEnabled      Boolean  @default(false) @map("is_enabled")
  triggerMode    AITriggerMode @default(ALWAYS) @map("trigger_mode")
  triggerKeywords String[] @map("trigger_keywords") // If mode is KEYWORD
  responseDelay  Int      @default(2000) @map("response_delay") // ms, human-like delay

  // Business Hours (Malaysia timezone)
  businessHoursOnly   Boolean @default(false) @map("business_hours_only")
  businessHoursStart  String? @map("business_hours_start") // "09:00"
  businessHoursEnd    String? @map("business_hours_end")   // "18:00"
  outOfHoursMessage   String? @map("out_of_hours_message")

  // Handoff Settings
  handoffEnabled      Boolean @default(true) @map("handoff_enabled")
  handoffKeywords     String[] @map("handoff_keywords") // "speak to human", "agent"
  handoffMessage      String? @map("handoff_message")

  // Response Style
  systemPrompt   String?  @map("system_prompt") @db.Text
  companyName    String?  @map("company_name")
  language       String   @default("en") // "en", "ms", "zh"
  tone           String   @default("professional") // "professional", "friendly", "formal"

  // Limits
  maxConversationTurns Int @default(10) @map("max_conversation_turns")

  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("ai_configs")
}

enum AITriggerMode {
  ALWAYS           // Auto-reply to all messages
  UNASSIGNED_ONLY  // Only when no agent assigned
  KEYWORD          // Only when message contains keywords
  OFF              // Disabled
}

// ==================== CONVERSATION AI STATE ====================

model ConversationAIState {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  conversationId  String   @unique @map("conversation_id") @db.Uuid
  isAIActive      Boolean  @default(true) @map("is_ai_active")
  turnCount       Int      @default(0) @map("turn_count")
  lastAIResponse  DateTime? @map("last_ai_response")
  handoffReason   String?  @map("handoff_reason")
  context         Json     @default("{}") // Conversation context for continuity
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@map("conversation_ai_states")
}
```

### 1.3 Update Existing Models

```prisma
// Add to Organization model
model Organization {
  // ... existing fields ...
  knowledgeBanks  KnowledgeBank[]
  aiConfig        AIConfig?
}

// Add to Conversation model
model Conversation {
  // ... existing fields ...
  aiState ConversationAIState?
}

// Add to Message model - track AI-generated messages
model Message {
  // ... existing fields ...
  isAIGenerated Boolean @default(false) @map("is_ai_generated")
  aiMetadata    Json?   @map("ai_metadata") // Sources used, confidence, etc.
}
```

---

## Phase 2: Backend Implementation

### 2.1 New Module Structure

```
backend/src/modules/
├── knowledge/
│   ├── knowledge.controller.ts
│   ├── knowledge.service.ts
│   ├── knowledge.routes.ts
│   ├── processors/
│   │   ├── text.processor.ts
│   │   ├── pdf.processor.ts
│   │   ├── image.processor.ts
│   │   ├── spreadsheet.processor.ts
│   │   └── index.ts
│   └── embeddings/
│       └── openai.embeddings.ts
├── products/
│   ├── product.controller.ts
│   ├── product.service.ts
│   └── product.routes.ts
└── ai/
    ├── ai.controller.ts
    ├── ai.service.ts
    ├── ai.routes.ts
    ├── rag/
    │   ├── retriever.ts
    │   ├── prompt-builder.ts
    │   └── response-generator.ts
    └── handlers/
        └── auto-reply.handler.ts
```

### 2.2 Knowledge Service Implementation

```typescript
// backend/src/modules/knowledge/knowledge.service.ts

import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

export class KnowledgeService {
  private openai: OpenAI;
  private prisma: PrismaClient;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  // Upload and process document
  async processDocument(documentId: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId }
    });

    // 1. Extract text based on type
    let text: string;
    switch (document.type) {
      case 'PDF':
        text = await this.extractPDF(document.sourceUrl);
        break;
      case 'IMAGE':
        text = await this.extractImageOCR(document.sourceUrl);
        break;
      case 'SPREADSHEET':
        text = await this.extractSpreadsheet(document.sourceUrl);
        break;
      default:
        text = document.rawContent;
    }

    // 2. Chunk the text
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitText(text);

    // 3. Generate embeddings and store
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.generateEmbedding(chunks[i]);

      await this.prisma.$executeRaw`
        INSERT INTO knowledge_chunks (id, document_id, content, embedding, chunk_index, token_count, created_at)
        VALUES (
          gen_random_uuid(),
          ${documentId}::uuid,
          ${chunks[i]},
          ${embedding}::vector,
          ${i},
          ${this.countTokens(chunks[i])},
          NOW()
        )
      `;
    }

    // 4. Update document status
    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { status: 'COMPLETED', rawContent: text }
    });
  }

  // Generate embedding using OpenAI
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small', // Cheaper, better than ada-002
      input: text,
    });
    return response.data[0].embedding;
  }

  // Semantic search using pgvector
  async searchSimilar(
    organizationId: string,
    query: string,
    limit: number = 5
  ): Promise<Array<{ content: string; similarity: number; metadata: any }>> {
    const queryEmbedding = await this.generateEmbedding(query);

    const results = await this.prisma.$queryRaw`
      SELECT
        kc.content,
        kc.metadata,
        kd.title as document_title,
        1 - (kc.embedding <=> ${queryEmbedding}::vector) as similarity
      FROM knowledge_chunks kc
      JOIN knowledge_documents kd ON kc.document_id = kd.id
      JOIN knowledge_banks kb ON kd.knowledge_bank_id = kb.id
      WHERE kb.organization_id = ${organizationId}::uuid
        AND kb.is_active = true
      ORDER BY kc.embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;

    return results;
  }
}
```

### 2.3 AI Auto-Reply Service

```typescript
// backend/src/modules/ai/ai.service.ts

import OpenAI from 'openai';
import { KnowledgeService } from '../knowledge/knowledge.service';

export class AIService {
  private openai: OpenAI;
  private knowledgeService: KnowledgeService;

  // Generate response using RAG
  async generateResponse(
    organizationId: string,
    conversationId: string,
    userMessage: string
  ): Promise<{ response: string; sources: string[]; shouldHandoff: boolean }> {

    // 1. Get AI config
    const config = await this.getAIConfig(organizationId);
    if (!config.isEnabled) {
      return { response: null, sources: [], shouldHandoff: true };
    }

    // 2. Check for handoff keywords
    if (this.shouldHandoff(userMessage, config)) {
      return {
        response: config.handoffMessage || "I'll connect you with a human agent.",
        sources: [],
        shouldHandoff: true
      };
    }

    // 3. Retrieve relevant context from Knowledge Bank
    const relevantChunks = await this.knowledgeService.searchSimilar(
      organizationId,
      userMessage,
      5
    );

    // 4. Search products if query seems product-related
    const products = await this.searchProducts(organizationId, userMessage);

    // 5. Build prompt with context
    const systemPrompt = this.buildSystemPrompt(config, relevantChunks, products);

    // 6. Get conversation history for context
    const history = await this.getConversationHistory(conversationId, 5);

    // 7. Generate response
    const completion = await this.openai.chat.completions.create({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage }
      ]
    });

    const response = completion.choices[0].message.content;

    // 8. Extract sources used
    const sources = relevantChunks
      .filter(c => c.similarity > 0.7)
      .map(c => c.document_title);

    return { response, sources, shouldHandoff: false };
  }

  private buildSystemPrompt(
    config: AIConfig,
    chunks: any[],
    products: any[]
  ): string {
    const context = chunks.map(c => c.content).join('\n\n');
    const productInfo = products.length > 0
      ? this.formatProductInfo(products)
      : '';

    return `${config.systemPrompt || this.getDefaultSystemPrompt(config)}

## KNOWLEDGE BASE CONTEXT:
${context}

${productInfo ? `## PRODUCT INFORMATION:\n${productInfo}` : ''}

## IMPORTANT RULES:
1. Only answer based on the provided context
2. If information is not in context, say "I don't have that information, let me connect you with our team"
3. Always be helpful and professional
4. For pricing, always mention "subject to confirmation"
5. For technical specifications, be precise
6. Respond in ${this.getLanguageName(config.language)}
7. Company name: ${config.companyName || 'our company'}
`;
  }

  private getDefaultSystemPrompt(config: AIConfig): string {
    return `You are a helpful sales assistant for ${config.companyName || 'a medical device equipment supplier'} in Malaysia.
You help customers with:
- Product inquiries and specifications
- Pricing information (always mention prices are subject to confirmation)
- Product availability and lead times
- Technical specifications
- Certifications (MDA, ISO 13485, CE marking)

Be professional, accurate, and helpful. If you're unsure, offer to connect with a human agent.`;
  }
}
```

### 2.4 Auto-Reply Handler (Integrate with Message Worker)

```typescript
// backend/src/modules/ai/handlers/auto-reply.handler.ts

import { AIService } from '../ai.service';
import { MessageService } from '../../message/message.service';

export class AutoReplyHandler {
  private aiService: AIService;
  private messageService: MessageService;

  async handleIncomingMessage(
    conversationId: string,
    message: Message
  ): Promise<void> {
    // Only process inbound text messages
    if (message.direction !== 'INBOUND' || message.type !== 'TEXT') {
      return;
    }

    const conversation = await this.getConversation(conversationId);
    const config = await this.getAIConfig(conversation.channel.organizationId);

    // Check if AI should respond
    if (!this.shouldAIRespond(conversation, config)) {
      return;
    }

    // Check business hours
    if (config.businessHoursOnly && !this.isWithinBusinessHours(config)) {
      if (config.outOfHoursMessage) {
        await this.sendAIMessage(conversationId, config.outOfHoursMessage);
      }
      return;
    }

    // Add human-like delay
    await this.delay(config.responseDelay);

    // Generate AI response
    const { response, sources, shouldHandoff } = await this.aiService.generateResponse(
      conversation.channel.organizationId,
      conversationId,
      message.content.text
    );

    if (response) {
      // Send AI response
      await this.sendAIMessage(conversationId, response, sources);
    }

    if (shouldHandoff) {
      // Update conversation state for human handoff
      await this.triggerHandoff(conversationId);
    }
  }

  private async sendAIMessage(
    conversationId: string,
    text: string,
    sources?: string[]
  ): Promise<void> {
    await this.messageService.sendMessage({
      conversationId,
      content: { text },
      isAIGenerated: true,
      aiMetadata: { sources, generatedAt: new Date() }
    });
  }
}
```

### 2.5 Worker Integration

```typescript
// backend/src/workers/index.ts - Add to processMessage function

import { AutoReplyHandler } from '../modules/ai/handlers/auto-reply.handler';

// Inside processIncomingMessage after saving message:
const autoReplyHandler = new AutoReplyHandler();
await autoReplyHandler.handleIncomingMessage(conversation.id, savedMessage);
```

---

## Phase 3: Knowledge Bank API Routes

### 3.1 Knowledge Bank Routes

```typescript
// backend/src/modules/knowledge/knowledge.routes.ts

router.get('/knowledge-banks', listKnowledgeBanks);
router.post('/knowledge-banks', createKnowledgeBank);
router.get('/knowledge-banks/:id', getKnowledgeBank);
router.patch('/knowledge-banks/:id', updateKnowledgeBank);
router.delete('/knowledge-banks/:id', deleteKnowledgeBank);

// Documents
router.get('/knowledge-banks/:id/documents', listDocuments);
router.post('/knowledge-banks/:id/documents', uploadDocument);
router.delete('/knowledge-banks/:bankId/documents/:docId', deleteDocument);
router.post('/knowledge-banks/:bankId/documents/:docId/reprocess', reprocessDocument);

// Products
router.get('/knowledge-banks/:id/products', listProducts);
router.post('/knowledge-banks/:id/products', createProduct);
router.post('/knowledge-banks/:id/products/import', importProductsCSV);
router.patch('/knowledge-banks/:bankId/products/:productId', updateProduct);
router.delete('/knowledge-banks/:bankId/products/:productId', deleteProduct);

// Search (for testing)
router.post('/knowledge-banks/search', searchKnowledgeBase);
```

### 3.2 AI Config Routes

```typescript
// backend/src/modules/ai/ai.routes.ts

router.get('/ai/config', getAIConfig);
router.patch('/ai/config', updateAIConfig);
router.post('/ai/test', testAIResponse); // Test with sample message
router.get('/ai/analytics', getAIAnalytics); // Response stats
```

---

## Phase 4: Frontend Implementation

### 4.1 New Pages Structure

```
frontend/src/app/(dashboard)/
├── knowledge/
│   └── page.tsx           # Knowledge Bank management
├── products/
│   └── page.tsx           # Product catalog management
└── settings/
    └── ai/
        └── page.tsx       # AI configuration
```

### 4.2 Knowledge Bank Page Features

```typescript
// frontend/src/app/(dashboard)/knowledge/page.tsx

// Features:
// 1. List Knowledge Banks (tabs: All, Active, Inactive)
// 2. Create/Edit Knowledge Bank
// 3. Document Management
//    - Upload: PDF, TXT, Images, CSV/Excel
//    - Drag & drop support
//    - Processing status indicators
//    - Preview extracted content
// 4. FAQ Builder
//    - Q&A pairs editor
//    - Import from spreadsheet
// 5. Search Testing
//    - Test queries against knowledge base
//    - See retrieved chunks and similarity scores
```

### 4.3 Product Catalog Page Features

```typescript
// frontend/src/app/(dashboard)/products/page.tsx

// Features:
// 1. Product List with search/filter
//    - By category, brand, availability
// 2. Product Form
//    - Basic info (name, SKU, descriptions)
//    - Multi-language support (EN, MS, CN)
//    - Pricing (MYR, quantity tiers)
//    - Specifications (JSON editor or form)
//    - Images (multiple upload)
//    - Certifications checkboxes
// 3. Import/Export
//    - CSV template download
//    - Bulk import with preview
//    - Export current catalog
// 4. Inventory Status
//    - In stock toggle
//    - Lead time setting
```

### 4.4 AI Settings Page Features

```typescript
// frontend/src/app/(dashboard)/settings/ai/page.tsx

// Sections:
// 1. AI Status Toggle (Enable/Disable)
// 2. OpenAI Configuration
//    - API Key (encrypted)
//    - Model selection (gpt-4o-mini, gpt-4o)
//    - Temperature slider
//    - Max tokens
// 3. Auto-Reply Behavior
//    - Trigger mode (Always, Unassigned only, Keywords)
//    - Response delay (human-like)
//    - Max conversation turns
// 4. Business Hours
//    - Enable/disable
//    - Start/end time (Malaysia timezone)
//    - Out-of-hours message
// 5. Handoff Settings
//    - Keywords to trigger handoff
//    - Handoff message
// 6. Response Style
//    - System prompt editor
//    - Language preference
//    - Tone selection
// 7. Test Panel
//    - Send test message
//    - See AI response + sources
```

---

## Phase 5: Medical Device Specific Features

### 5.1 Product Specifications Schema

```typescript
// Common medical device specification fields
interface MedicalDeviceSpecs {
  // Regulatory
  mdaRegistration?: string;    // MDA registration number
  ceMarking?: boolean;
  fdaCleared?: boolean;
  iso13485?: boolean;
  riskClass?: 'A' | 'B' | 'C' | 'D';  // MDA classification

  // Technical
  powerSupply?: string;        // "220V AC", "Battery"
  dimensions?: string;         // "30 x 40 x 50 cm"
  weight?: string;             // "5 kg"
  operatingTemp?: string;      // "15-35°C"
  warranty?: string;           // "1 year"

  // For diagnostic equipment
  accuracy?: string;
  measurementRange?: string;
  displayType?: string;
  connectivity?: string[];     // ["USB", "Bluetooth", "WiFi"]

  // For consumables
  packSize?: number;
  shelfLife?: string;
  storageConditions?: string;
}
```

### 5.2 Sample System Prompt for Medical Device Sales

```
You are a professional sales assistant for [Company Name], a leading medical device equipment supplier in Malaysia.

YOUR EXPERTISE:
- Medical diagnostic equipment (monitors, analyzers, imaging)
- Surgical instruments and supplies
- Hospital furniture and fixtures
- Laboratory equipment
- Consumables and disposables

IMPORTANT GUIDELINES:
1. REGULATORY: Always mention relevant certifications (MDA, ISO 13485, CE) when discussing products
2. PRICING: Always say "prices are subject to confirmation and may vary based on quantity"
3. AVAILABILITY: Check stock status before confirming availability
4. SPECIFICATIONS: Be precise with technical specifications
5. COMPLIANCE: For regulated products, recommend consulting with regulatory affairs

MALAYSIAN CONTEXT:
- Use MYR for all pricing
- Mention GST if applicable
- Reference Malaysian Medical Device Authority (MDA) requirements
- Support Bahasa Malaysia and English responses

HANDOFF TRIGGERS:
- Complex technical consultations
- Custom quotation requests
- Bulk orders requiring special pricing
- Installation/service inquiries
- Complaints or issues

Always be helpful, professional, and accurate. When uncertain, offer to connect with our specialist team.
```

### 5.3 Multi-Language Support

```typescript
// Language detection and response
async generateResponse(message: string, preferredLang?: string) {
  // Detect language if not specified
  const detectedLang = await this.detectLanguage(message);
  const responseLang = preferredLang || detectedLang || 'en';

  // Add language instruction to prompt
  const langInstruction = {
    'en': 'Respond in English',
    'ms': 'Balas dalam Bahasa Malaysia',
    'zh': '请用中文回复'
  }[responseLang];

  // Include in system prompt
}
```

---

## Phase 6: Implementation Order

### Step 1: Database Setup (Day 1-2)
1. Add pgvector extension to PostgreSQL
2. Create Prisma schema migrations
3. Test vector operations

### Step 2: Knowledge Service (Day 3-5)
1. Implement document processors (PDF, image, text)
2. Implement chunking and embedding
3. Implement vector search
4. Create BullMQ job for async processing

### Step 3: Product Catalog (Day 6-7)
1. Product CRUD operations
2. CSV import/export
3. Search integration

### Step 4: AI Service (Day 8-10)
1. OpenAI integration
2. RAG pipeline (retrieve → augment → generate)
3. Response generation with sources

### Step 5: Auto-Reply Handler (Day 11-12)
1. Integrate with message worker
2. Trigger logic (always/unassigned/keyword)
3. Handoff detection
4. Business hours check

### Step 6: Frontend - Knowledge Bank (Day 13-15)
1. Knowledge bank management UI
2. Document upload with progress
3. FAQ builder

### Step 7: Frontend - Products (Day 16-17)
1. Product catalog UI
2. CSV import wizard
3. Specifications editor

### Step 8: Frontend - AI Settings (Day 18-19)
1. AI configuration panel
2. Test panel
3. Analytics dashboard

### Step 9: Testing & Refinement (Day 20-21)
1. End-to-end testing
2. Prompt tuning
3. Performance optimization

---

## Phase 7: Dependencies to Install

### Backend

```json
{
  "dependencies": {
    "openai": "^4.x",
    "langchain": "^0.3.x",
    "@langchain/openai": "^0.3.x",
    "pdf-parse": "^1.1.1",
    "tesseract.js": "^5.x",
    "xlsx": "^0.18.x",
    "tiktoken": "^1.x"
  }
}
```

### Database

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create index for fast similarity search
CREATE INDEX ON knowledge_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

## Phase 8: Cost Estimation

### OpenAI API Costs (Monthly Estimate)

| Component | Model | Est. Usage | Cost |
|-----------|-------|------------|------|
| Embeddings | text-embedding-3-small | 1M tokens | ~$0.02 |
| Chat | gpt-4o-mini | 500K tokens | ~$0.075 |
| Chat | gpt-4o (complex) | 100K tokens | ~$2.50 |

**Estimated Monthly: ~$5-20 USD** (varies with volume)

### Malaysian Ringgit: ~RM 22-90/month

---

## Phase 9: Security Considerations

1. **API Key Storage**: Encrypt OpenAI API keys at rest
2. **Rate Limiting**: Limit AI requests per conversation/user
3. **Content Filtering**: Review AI responses for accuracy
4. **Data Privacy**: Medical device inquiries may contain sensitive info
5. **Audit Logging**: Log all AI interactions for compliance

---

## Sources & References

- [Pinecone vs pgvector Comparison](https://www.pinecone.io/blog/pinecone-vs-pgvector/)
- [Why Confident AI Replaced Pinecone with pgvector](https://www.confident-ai.com/blog/why-we-replaced-pinecone-with-pgvector)
- [Building RAG Systems with Node.js & OpenAI](https://www.zignuts.com/blog/build-rag-system-nodejs-openai)
- [WhatsApp RAG Chatbot with n8n](https://n8n.io/workflows/2845-complete-business-whatsapp-ai-powered-rag-chatbot-using-openai/)
- [Healthcare Chatbot Development Guide](https://mobidev.biz/blog/healthcare-chatbot-development-guide)
- [Knowledge Base Chatbot Best Practices](https://salesgroup.ai/knowledge-base-chatbot/)
- [Sales Chatbot Guide 2025](https://www.zendesk.com/service/messaging/ai-chatbot-for-sales/)
- [WhatsApp Business API Malaysia](https://sleekflow.io/blog/malaysia-whatsapp-business-api-case-study)
- [AI Chatbot Setup Costs Malaysia](https://thecrunch.io/ai-chatbot-setup-costs/)
- [OpenAI Assistants vs LangChain](https://www.eesel.ai/blog/assistants-api-vs-langchain)
- [Building AI Agents 2025: LangChain vs OpenAI](https://medium.com/@fahey_james/building-ai-agents-in-2025-langchain-vs-openai-d26fbceea05d)
