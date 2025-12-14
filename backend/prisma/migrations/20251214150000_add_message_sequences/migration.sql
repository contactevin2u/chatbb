-- CreateEnum
CREATE TYPE "MessageSequenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SequenceStepType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'DELAY');

-- CreateTable
CREATE TABLE "message_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "MessageSequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "trigger_type" TEXT NOT NULL DEFAULT 'manual',
    "trigger_config" JSONB,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_sequence_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "type" "SequenceStepType" NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequence_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "next_step_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "sequence_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_sequences_organization_id_idx" ON "message_sequences"("organization_id");

-- CreateIndex
CREATE INDEX "message_sequences_status_idx" ON "message_sequences"("status");

-- CreateIndex
CREATE INDEX "message_sequence_steps_sequence_id_idx" ON "message_sequence_steps"("sequence_id");

-- CreateIndex
CREATE INDEX "sequence_executions_sequence_id_idx" ON "sequence_executions"("sequence_id");

-- CreateIndex
CREATE INDEX "sequence_executions_conversation_id_idx" ON "sequence_executions"("conversation_id");

-- CreateIndex
CREATE INDEX "sequence_executions_status_idx" ON "sequence_executions"("status");

-- CreateIndex
CREATE INDEX "sequence_executions_next_step_at_idx" ON "sequence_executions"("next_step_at");

-- AddForeignKey
ALTER TABLE "message_sequences" ADD CONSTRAINT "message_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_sequence_steps" ADD CONSTRAINT "message_sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "message_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_executions" ADD CONSTRAINT "sequence_executions_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "message_sequences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sequence_executions" ADD CONSTRAINT "sequence_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
