-- ============================================================
-- Migration: Add database indexes for performance
-- Generated: 2026-08-19
-- Priority: HIGH
-- ============================================================
-- Run this after deploying the new code:
--   docker exec -i <db_container> psql -U <user> -d <dbname> < migrations/001_add_indexes.sql
-- Or use your preferred database client.
-- ============================================================

-- UserWordCard indexes (most critical - used by review scheduling queries)
CREATE INDEX IF NOT EXISTS idx_uwc_due_at ON user_word_cards (due_at);
CREATE INDEX IF NOT EXISTS idx_uwc_state ON user_word_cards (state);
CREATE INDEX IF NOT EXISTS idx_uwc_user_state ON user_word_cards (user_id, state);

-- ReviewLog indexes (used by sync, stats, and progress queries)
CREATE INDEX IF NOT EXISTS idx_rl_user_reviewed_at ON review_logs (user_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_rl_card_id ON review_logs (card_id);
CREATE INDEX IF NOT EXISTS idx_rl_word_id ON review_logs (word_id);

-- DailyPlan indexes (used by daily plan lookup)
CREATE INDEX IF NOT EXISTS idx_dp_plan_date ON daily_plans (plan_date);

-- ============================================================
-- Verification: check that indexes were created
-- ============================================================
-- SELECT tablename, indexname FROM pg_indexes 
-- WHERE tablename IN ('user_word_cards', 'review_logs', 'daily_plans')
-- ORDER BY tablename, indexname;
