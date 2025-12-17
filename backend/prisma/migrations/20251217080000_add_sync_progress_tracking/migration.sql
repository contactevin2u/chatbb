-- AlterTable - Add sync progress tracking fields
ALTER TABLE "channels" ADD COLUMN "sync_progress" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "channels" ADD COLUMN "sync_started_at" TIMESTAMP(3);
ALTER TABLE "channels" ADD COLUMN "last_sync_at" TIMESTAMP(3);
