-- Add active agent tracking for collision prevention
ALTER TABLE "conversations" ADD COLUMN "active_agent_id" UUID;
ALTER TABLE "conversations" ADD COLUMN "active_agent_since" TIMESTAMP(3);

-- Add foreign key constraint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_active_agent_id_fkey"
  FOREIGN KEY ("active_agent_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for efficient lookups
CREATE INDEX "conversations_active_agent_id_idx" ON "conversations"("active_agent_id");
