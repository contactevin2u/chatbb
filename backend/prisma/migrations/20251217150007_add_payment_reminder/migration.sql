-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "order_id" INTEGER NOT NULL,
    "order_code" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "amount_due" DECIMAL(10,2) NOT NULL,
    "days_past_due" INTEGER NOT NULL,
    "message_id" UUID,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_reminder_at" TIMESTAMP(3) NOT NULL,
    "reminder_sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reminders_organization_id_idx" ON "payment_reminders"("organization_id");

-- CreateIndex
CREATE INDEX "payment_reminders_order_id_idx" ON "payment_reminders"("order_id");

-- CreateIndex
CREATE INDEX "payment_reminders_customer_phone_idx" ON "payment_reminders"("customer_phone");

-- CreateIndex
CREATE INDEX "payment_reminders_next_reminder_at_idx" ON "payment_reminders"("next_reminder_at");

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
