-- Add an index to speed up suggested-task queries on the Tasks page and Dashboard widget
CREATE INDEX IF NOT EXISTS idx_action_items_user_status ON public.action_items(user_id, status);