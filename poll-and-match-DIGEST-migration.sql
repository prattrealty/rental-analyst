alter table public.user_alert_criteria
  add column if not exists last_emailed_at timestamptz null;
