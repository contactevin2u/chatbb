-- CreateEnum
CREATE TYPE "ScheduledMessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- DropIndex
DROP INDEX "messages_channel_id_idx";

-- DropIndex
DROP INDEX "messages_external_id_idx";

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "is_group" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "scheduled_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "status" "ScheduledMessageStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_messages_organization_id_idx" ON "scheduled_messages"("organization_id");

-- CreateIndex
CREATE INDEX "scheduled_messages_conversation_id_idx" ON "scheduled_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "scheduled_messages_scheduled_at_idx" ON "scheduled_messages"("scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_messages_status_idx" ON "scheduled_messages"("status");

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
