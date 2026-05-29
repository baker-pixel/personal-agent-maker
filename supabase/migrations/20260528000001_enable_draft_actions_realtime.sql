-- Enable realtime for draft_actions so the Approval Inbox badge and list
-- update instantly when drafts are created, updated, or deleted.
ALTER PUBLICATION supabase_realtime ADD TABLE public.draft_actions;
