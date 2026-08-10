DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'store_calendar_tasks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_calendar_tasks;
  END IF;
END
$$;

ALTER TABLE public.store_calendar_tasks REPLICA IDENTITY FULL;

