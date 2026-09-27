-- Optional party roles on each case; existing cases keep blank roles.
BEGIN;
ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS client_role text,
    ADD COLUMN IF NOT EXISTS opponent_role text;
NOTIFY pgrst, 'reload schema';
COMMIT;
