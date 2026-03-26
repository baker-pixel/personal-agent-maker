
-- Email reminders / snooze table
CREATE TABLE public.email_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email_subject TEXT NOT NULL,
  email_from TEXT NOT NULL,
  email_snippet TEXT,
  remind_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own reminders" ON public.email_reminders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Scheduling preferences table
CREATE TABLE public.scheduling_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  working_hours_start TIME NOT NULL DEFAULT '09:00',
  working_hours_end TIME NOT NULL DEFAULT '17:00',
  buffer_minutes INT NOT NULL DEFAULT 15,
  preferred_meeting_duration INT NOT NULL DEFAULT 30,
  block_lunch BOOLEAN NOT NULL DEFAULT true,
  lunch_start TIME NOT NULL DEFAULT '12:00',
  lunch_end TIME NOT NULL DEFAULT '13:00',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduling_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own scheduling prefs" ON public.scheduling_preferences
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
