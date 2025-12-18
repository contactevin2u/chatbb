-- ============================================================
-- PostgreSQL 18 Magic Migration
-- Advanced features: pgvector, pg_trgm, BRIN, GIN, HNSW indexes
-- ============================================================

-- CreateExtension: Trigram for fuzzy text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension: Vector for AI embeddings & semantic search (requires pgvector installed)
-- This will silently skip on local dev if pgvector not installed
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available - skipping (install for production)';
END $$;

-- AlterTable: Add embedding column for AI semantic search
-- Use bytea fallback if vector type doesn't exist (local dev without pgvector)
DO $$
BEGIN
  ALTER TABLE "knowledge_items" ADD COLUMN "embedding" vector(1536);
EXCEPTION WHEN undefined_object THEN
  -- vector type doesn't exist, skip column addition
  RAISE NOTICE 'vector type not available - skipping embedding column';
END $$;

-- ============================================================
-- BRIN INDEXES (Block Range INdex)
-- Super compact indexes for time-ordered data (~1000x smaller than B-tree)
-- Perfect for append-only tables where data is naturally ordered by time
-- ============================================================

-- Messages: BRIN on created_at for time-range queries
CREATE INDEX IF NOT EXISTS "messages_created_at_brin"
  ON "messages" USING BRIN ("created_at");

-- Audit logs: BRIN on created_at for compliance queries
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_brin"
  ON "audit_logs" USING BRIN ("created_at");

-- Webhook deliveries: BRIN on delivered_at for log queries
CREATE INDEX IF NOT EXISTS "webhook_deliveries_delivered_at_brin"
  ON "webhook_deliveries" USING BRIN ("delivered_at");

-- Automation logs: BRIN on executed_at for history queries
CREATE INDEX IF NOT EXISTS "automation_logs_executed_at_brin"
  ON "automation_logs" USING BRIN ("executed_at");

-- ============================================================
-- GIN INDEXES for Full-Text Search
-- Uses pg_trgm for fuzzy matching (typo-tolerant search)
-- ============================================================

-- Contacts: GIN trigram index on display_name for fuzzy search
CREATE INDEX IF NOT EXISTS "contacts_display_name_trgm"
  ON "contacts" USING GIN ("display_name" gin_trgm_ops);

-- Contacts: GIN trigram on identifier for phone/email search
CREATE INDEX IF NOT EXISTS "contacts_identifier_trgm"
  ON "contacts" USING GIN ("identifier" gin_trgm_ops);

-- Knowledge items: GIN trigram on title for search
CREATE INDEX IF NOT EXISTS "knowledge_items_title_trgm"
  ON "knowledge_items" USING GIN ("title" gin_trgm_ops);

-- Knowledge items: GIN trigram on content for full-text search
CREATE INDEX IF NOT EXISTS "knowledge_items_content_trgm"
  ON "knowledge_items" USING GIN ("content" gin_trgm_ops);

-- Quick replies: GIN trigram on name and shortcut for search
CREATE INDEX IF NOT EXISTS "quick_replies_name_trgm"
  ON "quick_replies" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "quick_replies_shortcut_trgm"
  ON "quick_replies" USING GIN ("shortcut" gin_trgm_ops);

-- ============================================================
-- HNSW INDEX for Vector Similarity Search
-- Hierarchical Navigable Small World - fast approximate nearest neighbor
-- Uses cosine distance (best for text embeddings)
-- ============================================================

-- Knowledge items: HNSW index for semantic search on embeddings
-- m=16 (connections per layer), ef_construction=64 (build quality)
-- Wrapped in DO block to skip if vector extension not available
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS "knowledge_items_embedding_hnsw"
    ON "knowledge_items" USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'vector type not available - skipping HNSW index';
END $$;

-- ============================================================
-- GIN INDEX for Array Search
-- Fast lookup in array columns (keywords, tags)
-- ============================================================

-- Knowledge items: GIN on keywords array for tag-based search
CREATE INDEX IF NOT EXISTS "knowledge_items_keywords_gin"
  ON "knowledge_items" USING GIN ("keywords");

-- ============================================================
-- PARTIAL INDEXES
-- Smaller, faster indexes that only include relevant rows
-- ============================================================

-- Conversations: Only index non-closed conversations (most queried)
CREATE INDEX IF NOT EXISTS "conversations_open_idx"
  ON "conversations" ("organization_id", "last_message_at" DESC)
  WHERE "status" != 'CLOSED';

-- Scheduled messages: Only index pending (what workers query)
CREATE INDEX IF NOT EXISTS "scheduled_messages_pending_idx"
  ON "scheduled_messages" ("scheduled_at")
  WHERE "status" = 'PENDING';

-- Sequence executions: Only index running/scheduled (what workers query)
CREATE INDEX IF NOT EXISTS "sequence_executions_active_idx"
  ON "sequence_executions" ("next_step_at")
  WHERE "status" IN ('running', 'scheduled');

-- Broadcasts: Only index processing (active campaigns)
CREATE INDEX IF NOT EXISTS "broadcasts_processing_idx"
  ON "broadcasts" ("organization_id")
  WHERE "status" = 'PROCESSING';

-- Channels: Only index connected WhatsApp channels
CREATE INDEX IF NOT EXISTS "channels_connected_whatsapp_idx"
  ON "channels" ("organization_id")
  WHERE "type" = 'WHATSAPP' AND "status" = 'CONNECTED';
