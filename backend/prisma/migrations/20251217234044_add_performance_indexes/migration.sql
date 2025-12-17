-- CreateIndex
CREATE INDEX "channels_type_status_idx" ON "channels"("type", "status");

-- CreateIndex
CREATE INDEX "channels_organization_id_status_idx" ON "channels"("organization_id", "status");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "scheduled_messages_status_scheduled_at_idx" ON "scheduled_messages"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "sequence_executions_status_next_step_at_idx" ON "sequence_executions"("status", "next_step_at");
