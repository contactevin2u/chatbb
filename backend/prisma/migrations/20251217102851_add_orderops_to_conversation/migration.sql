-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "orderops_linked_at" TIMESTAMP(3),
ADD COLUMN     "orderops_order_code" TEXT,
ADD COLUMN     "orderops_order_id" INTEGER;

-- CreateIndex
CREATE INDEX "conversations_orderops_order_id_idx" ON "conversations"("orderops_order_id");
