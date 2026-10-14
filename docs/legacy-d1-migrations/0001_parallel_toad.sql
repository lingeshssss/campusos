CREATE TABLE `google_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`google_sub` text,
	`email` text,
	`refresh_token` text,
	`calendar_id` text,
	`calendar_status` text DEFAULT 'none' NOT NULL,
	`event_map` text DEFAULT '{}' NOT NULL,
	`last_synced` text,
	`last_error` text,
	`lock_id` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_oauth_attempts` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `google_sync_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`payload` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
