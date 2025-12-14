-- CreateEnum
CREATE TYPE "AgentAvailability" AS ENUM ('ONLINE', 'AWAY', 'BUSY', 'OFFLINE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "availability_status" "AgentAvailability" NOT NULL DEFAULT 'OFFLINE';

-- CreateTable
CREATE TABLE "conversation_agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" UUID,

    CONSTRAINT "conversation_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_agents_conversation_id_idx" ON "conversation_agents"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_agents_user_id_idx" ON "conversation_agents"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_agents_conversation_id_user_id_key" ON "conversation_agents"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "users_availability_status_idx" ON "users"("availability_status");

-- AddForeignKey
ALTER TABLE "conversation_agents" ADD CONSTRAINT "conversation_agents_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_agents" ADD CONSTRAINT "conversation_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
