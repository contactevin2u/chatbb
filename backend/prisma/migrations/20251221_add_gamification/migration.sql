-- ============================================================
-- Gamification & Leaderboard Migration
-- Lightweight scoring system for sales team engagement
-- ============================================================

-- ==================== AGENT GAME STATS ====================
-- Tracks cumulative gamification points per agent
-- Updated in real-time when agents perform actions

CREATE TABLE "agent_game_stats" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,

  -- Cumulative points (all-time)
  "total_points" INTEGER NOT NULL DEFAULT 0,

  -- Daily points (reset at midnight)
  "today_points" INTEGER NOT NULL DEFAULT 0,
  "today_date" DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Weekly points (reset on Monday)
  "week_points" INTEGER NOT NULL DEFAULT 0,
  "week_start" DATE NOT NULL DEFAULT date_trunc('week', CURRENT_DATE)::DATE,

  -- Monthly points (reset on 1st)
  "month_points" INTEGER NOT NULL DEFAULT 0,
  "month_start" DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,

  -- Streak tracking
  "current_streak" INTEGER NOT NULL DEFAULT 0,
  "longest_streak" INTEGER NOT NULL DEFAULT 0,
  "last_active_date" DATE,

  -- Action counters (for achievements)
  "messages_sent" INTEGER NOT NULL DEFAULT 0,
  "conversations_closed" INTEGER NOT NULL DEFAULT 0,
  "conversations_viewed" INTEGER NOT NULL DEFAULT 0,

  -- Lucky bonus tracking
  "lucky_stars_won" INTEGER NOT NULL DEFAULT 0,
  "last_lucky_star_at" TIMESTAMP(3),

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_game_stats_pkey" PRIMARY KEY ("id")
);

-- One stats record per user
CREATE UNIQUE INDEX "agent_game_stats_user_id_key" ON "agent_game_stats"("user_id");

-- Leaderboard queries (top agents by points)
CREATE INDEX "agent_game_stats_org_today" ON "agent_game_stats"("organization_id", "today_points" DESC);
CREATE INDEX "agent_game_stats_org_week" ON "agent_game_stats"("organization_id", "week_points" DESC);
CREATE INDEX "agent_game_stats_org_month" ON "agent_game_stats"("organization_id", "month_points" DESC);
CREATE INDEX "agent_game_stats_org_total" ON "agent_game_stats"("organization_id", "total_points" DESC);

-- Foreign keys
ALTER TABLE "agent_game_stats" ADD CONSTRAINT "agent_game_stats_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_game_stats" ADD CONSTRAINT "agent_game_stats_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ==================== REWARD EVENTS ====================
-- Log of individual reward events (for history/audit)

CREATE TABLE "reward_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,

  -- What triggered the reward
  "action_type" TEXT NOT NULL, -- 'message', 'view', 'close', 'lucky_star', 'streak_bonus'

  -- Points awarded
  "points" INTEGER NOT NULL,

  -- Fun message shown to user
  "message" TEXT,

  -- Was this a special reward?
  "is_lucky_star" BOOLEAN NOT NULL DEFAULT false,
  "is_streak_bonus" BOOLEAN NOT NULL DEFAULT false,

  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reward_events_pkey" PRIMARY KEY ("id")
);

-- Query recent rewards for a user
CREATE INDEX "reward_events_user_recent" ON "reward_events"("user_id", "created_at" DESC);

-- Org-wide reward activity
CREATE INDEX "reward_events_org_recent" ON "reward_events"("organization_id", "created_at" DESC);

-- Foreign keys
ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reward_events" ADD CONSTRAINT "reward_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================
-- FUNCTION: Reset daily/weekly/monthly points
-- Called by cron or on first action of day
-- ============================================================

CREATE OR REPLACE FUNCTION reset_period_points()
RETURNS void AS $$
BEGIN
  -- Reset daily points if date changed
  UPDATE agent_game_stats
  SET
    today_points = 0,
    today_date = CURRENT_DATE
  WHERE today_date < CURRENT_DATE;

  -- Reset weekly points if new week
  UPDATE agent_game_stats
  SET
    week_points = 0,
    week_start = date_trunc('week', CURRENT_DATE)::DATE
  WHERE week_start < date_trunc('week', CURRENT_DATE)::DATE;

  -- Reset monthly points if new month
  UPDATE agent_game_stats
  SET
    month_points = 0,
    month_start = date_trunc('month', CURRENT_DATE)::DATE
  WHERE month_start < date_trunc('month', CURRENT_DATE)::DATE;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- FUNCTION: Add reward points to agent
-- Handles period resets, streak tracking, and event logging
-- ============================================================

CREATE OR REPLACE FUNCTION add_reward_points(
  p_user_id UUID,
  p_org_id UUID,
  p_action_type TEXT,
  p_points INTEGER,
  p_message TEXT DEFAULT NULL,
  p_is_lucky_star BOOLEAN DEFAULT false
)
RETURNS TABLE(
  total_points INTEGER,
  today_points INTEGER,
  streak INTEGER,
  is_new_day BOOLEAN
) AS $$
DECLARE
  v_stats agent_game_stats%ROWTYPE;
  v_is_new_day BOOLEAN := false;
  v_streak INTEGER := 0;
BEGIN
  -- Ensure user has a stats record
  INSERT INTO agent_game_stats (user_id, organization_id)
  VALUES (p_user_id, p_org_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Get current stats and lock row
  SELECT * INTO v_stats
  FROM agent_game_stats
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if new day (for welcome bonus)
  IF v_stats.today_date < CURRENT_DATE THEN
    v_is_new_day := true;

    -- Update streak
    IF v_stats.last_active_date = CURRENT_DATE - 1 THEN
      v_streak := v_stats.current_streak + 1;
    ELSE
      v_streak := 1;
    END IF;
  ELSE
    v_streak := v_stats.current_streak;
  END IF;

  -- Update stats
  UPDATE agent_game_stats
  SET
    total_points = total_points + p_points,
    today_points = CASE WHEN today_date < CURRENT_DATE THEN p_points ELSE today_points + p_points END,
    today_date = CURRENT_DATE,
    week_points = CASE WHEN week_start < date_trunc('week', CURRENT_DATE)::DATE THEN p_points ELSE week_points + p_points END,
    week_start = date_trunc('week', CURRENT_DATE)::DATE,
    month_points = CASE WHEN month_start < date_trunc('month', CURRENT_DATE)::DATE THEN p_points ELSE month_points + p_points END,
    month_start = date_trunc('month', CURRENT_DATE)::DATE,
    current_streak = v_streak,
    longest_streak = GREATEST(longest_streak, v_streak),
    last_active_date = CURRENT_DATE,
    messages_sent = messages_sent + CASE WHEN p_action_type = 'message' THEN 1 ELSE 0 END,
    conversations_closed = conversations_closed + CASE WHEN p_action_type = 'close' THEN 1 ELSE 0 END,
    conversations_viewed = conversations_viewed + CASE WHEN p_action_type = 'view' THEN 1 ELSE 0 END,
    lucky_stars_won = lucky_stars_won + CASE WHEN p_is_lucky_star THEN 1 ELSE 0 END,
    last_lucky_star_at = CASE WHEN p_is_lucky_star THEN CURRENT_TIMESTAMP ELSE last_lucky_star_at END,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id;

  -- Log the reward event
  INSERT INTO reward_events (user_id, organization_id, action_type, points, message, is_lucky_star)
  VALUES (p_user_id, p_org_id, p_action_type, p_points, p_message, p_is_lucky_star);

  -- Return updated stats
  RETURN QUERY
  SELECT
    ags.total_points,
    ags.today_points,
    ags.current_streak,
    v_is_new_day
  FROM agent_game_stats ags
  WHERE ags.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- VIEW: Leaderboard (convenient for API queries)
-- ============================================================

CREATE OR REPLACE VIEW leaderboard_today AS
SELECT
  u.id as user_id,
  u.first_name,
  u.last_name,
  u.avatar_url,
  u.organization_id,
  COALESCE(ags.today_points, 0) as points,
  COALESCE(ags.messages_sent, 0) as messages_sent,
  COALESCE(ags.conversations_closed, 0) as conversations_closed,
  COALESCE(ags.current_streak, 0) as streak,
  ROW_NUMBER() OVER (PARTITION BY u.organization_id ORDER BY COALESCE(ags.today_points, 0) DESC) as rank
FROM users u
LEFT JOIN agent_game_stats ags ON ags.user_id = u.id
WHERE u.status = 'ACTIVE' AND u.role IN ('AGENT', 'SUPERVISOR', 'ADMIN', 'OWNER');

CREATE OR REPLACE VIEW leaderboard_week AS
SELECT
  u.id as user_id,
  u.first_name,
  u.last_name,
  u.avatar_url,
  u.organization_id,
  COALESCE(ags.week_points, 0) as points,
  COALESCE(ags.messages_sent, 0) as messages_sent,
  COALESCE(ags.conversations_closed, 0) as conversations_closed,
  COALESCE(ags.current_streak, 0) as streak,
  ROW_NUMBER() OVER (PARTITION BY u.organization_id ORDER BY COALESCE(ags.week_points, 0) DESC) as rank
FROM users u
LEFT JOIN agent_game_stats ags ON ags.user_id = u.id
WHERE u.status = 'ACTIVE' AND u.role IN ('AGENT', 'SUPERVISOR', 'ADMIN', 'OWNER');

CREATE OR REPLACE VIEW leaderboard_month AS
SELECT
  u.id as user_id,
  u.first_name,
  u.last_name,
  u.avatar_url,
  u.organization_id,
  COALESCE(ags.month_points, 0) as points,
  COALESCE(ags.messages_sent, 0) as messages_sent,
  COALESCE(ags.conversations_closed, 0) as conversations_closed,
  COALESCE(ags.current_streak, 0) as streak,
  ROW_NUMBER() OVER (PARTITION BY u.organization_id ORDER BY COALESCE(ags.month_points, 0) DESC) as rank
FROM users u
LEFT JOIN agent_game_stats ags ON ags.user_id = u.id
WHERE u.status = 'ACTIVE' AND u.role IN ('AGENT', 'SUPERVISOR', 'ADMIN', 'OWNER');

CREATE OR REPLACE VIEW leaderboard_all_time AS
SELECT
  u.id as user_id,
  u.first_name,
  u.last_name,
  u.avatar_url,
  u.organization_id,
  COALESCE(ags.total_points, 0) as points,
  COALESCE(ags.messages_sent, 0) as messages_sent,
  COALESCE(ags.conversations_closed, 0) as conversations_closed,
  COALESCE(ags.current_streak, 0) as streak,
  COALESCE(ags.longest_streak, 0) as longest_streak,
  COALESCE(ags.lucky_stars_won, 0) as lucky_stars,
  ROW_NUMBER() OVER (PARTITION BY u.organization_id ORDER BY COALESCE(ags.total_points, 0) DESC) as rank
FROM users u
LEFT JOIN agent_game_stats ags ON ags.user_id = u.id
WHERE u.status = 'ACTIVE' AND u.role IN ('AGENT', 'SUPERVISOR', 'ADMIN', 'OWNER');
