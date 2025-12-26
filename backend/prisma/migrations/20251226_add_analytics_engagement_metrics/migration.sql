-- Add agent engagement metrics to analytics_daily table
ALTER TABLE "analytics_daily" ADD COLUMN "reply_sessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "analytics_daily" ADD COLUMN "continued_sessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "analytics_daily" ADD COLUMN "died_sessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "analytics_daily" ADD COLUMN "followup_sessions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "analytics_daily" ADD COLUMN "continuation_rate" DOUBLE PRECISION;
ALTER TABLE "analytics_daily" ADD COLUMN "avg_hours_to_response" DOUBLE PRECISION;
