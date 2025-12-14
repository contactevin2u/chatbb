-- Remove duplicate messages before adding unique constraint
-- Keep the most recent message for each channel_id + external_id combination
DELETE FROM "messages" m1
USING "messages" m2
WHERE m1.channel_id = m2.channel_id
  AND m1.external_id = m2.external_id
  AND m1.created_at < m2.created_at;

-- CreateIndex
CREATE UNIQUE INDEX "messages_channel_id_external_id_key" ON "messages"("channel_id", "external_id");
