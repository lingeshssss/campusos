CREATE TABLE "ai_parse_usage" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_parse_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "google_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"google_sub" text,
	"email" text,
	"refresh_token" text,
	"calendar_id" text,
	"calendar_status" text DEFAULT 'none' NOT NULL,
	"event_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced" timestamp with time zone,
	"last_error" text,
	"lock_id" text,
	"lock_until" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "google_connections_calendar_status" CHECK ("google_connections"."calendar_status" in ('none', 'creating', 'uncertain', 'ready'))
);
--> statement-breakpoint
ALTER TABLE "google_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "google_oauth_attempts" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"verifier" text NOT NULL,
	"expires" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_oauth_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "google_sync_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"expires" bigint NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_sync_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_states" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_states_version_positive" CHECK ("student_states"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "student_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_parse_usage" ADD CONSTRAINT "ai_parse_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_oauth_attempts" ADD CONSTRAINT "google_oauth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_sync_plans" ADD CONSTRAINT "google_sync_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_states" ADD CONSTRAINT "student_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "google_oauth_attempts_user_idx" ON "google_oauth_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "google_sync_plans_user_idx" ON "google_sync_plans" USING btree ("user_id");