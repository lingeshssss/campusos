-- CampusOS reads and writes these tables only from server routes, through DATABASE_URL, after verifying
-- the Supabase session and filtering by that user's ID. The browser never queries them directly.
--
-- Supabase grants the Data API roles (anon, authenticated) privileges on new public tables by default.
-- RLS is already enabled with no policies (deny all), and this migration also revokes those grants, so
-- the publishable key cannot read student state or Google token tables even if a policy is added by mistake.
DO $$
DECLARE
	r text;
	t text;
BEGIN
	FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
			FOREACH t IN ARRAY ARRAY['student_states', 'google_connections', 'google_oauth_attempts', 'google_sync_plans', 'ai_parse_usage'] LOOP
				EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
			END LOOP;
		END IF;
	END LOOP;
END
$$;
