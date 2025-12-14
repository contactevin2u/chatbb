-- AlterTable
ALTER TABLE "message_sequences" ADD COLUMN "shortcut" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "message_sequences_organization_id_shortcut_key" ON "message_sequences"("organization_id", "shortcut");
