-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('FAQ', 'PRODUCT', 'POLICY', 'GENERAL');

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "is_ai_generated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "type" "KnowledgeType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[],
    "category" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "openai_api_key" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "reply_to_all" BOOLEAN NOT NULL DEFAULT false,
    "response_delay_ms" INTEGER NOT NULL DEFAULT 2000,
    "business_hours_only" BOOLEAN NOT NULL DEFAULT false,
    "business_start" TEXT,
    "business_end" TEXT,
    "off_hours_message" TEXT,
    "handoff_keywords" TEXT[],
    "handoff_message" TEXT,
    "system_prompt" TEXT,
    "company_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_items_organization_id_idx" ON "knowledge_items"("organization_id");

-- CreateIndex
CREATE INDEX "knowledge_items_type_idx" ON "knowledge_items"("type");

-- CreateIndex
CREATE INDEX "knowledge_items_is_active_idx" ON "knowledge_items"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ai_configs_organization_id_key" ON "ai_configs"("organization_id");

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
