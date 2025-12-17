-- CreateTable
CREATE TABLE "conversation_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "order_id" INTEGER NOT NULL,
    "order_code" TEXT NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linked_by" UUID,

    CONSTRAINT "conversation_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_orders_conversation_id_idx" ON "conversation_orders"("conversation_id");

-- CreateIndex
CREATE INDEX "conversation_orders_order_id_idx" ON "conversation_orders"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_orders_conversation_id_order_id_key" ON "conversation_orders"("conversation_id", "order_id");

-- AddForeignKey
ALTER TABLE "conversation_orders" ADD CONSTRAINT "conversation_orders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_orders" ADD CONSTRAINT "conversation_orders_linked_by_fkey" FOREIGN KEY ("linked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
