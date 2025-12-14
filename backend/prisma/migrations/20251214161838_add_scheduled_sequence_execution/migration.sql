-- AlterTable
ALTER TABLE "sequence_executions" ADD COLUMN     "scheduled_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "sequence_executions_scheduled_at_idx" ON "sequence_executions"("scheduled_at");
