-- Laravel accesses these support tables through its direct PostgreSQL connection.
-- They are not part of the browser-facing Supabase Data API.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'migrations',
        'idempotency_keys',
        'user_event_retries',
        'cache',
        'cache_locks',
        'jobs',
        'job_batches',
        'failed_jobs'
    ] LOOP
        IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
        END IF;
    END LOOP;
END
$$;
