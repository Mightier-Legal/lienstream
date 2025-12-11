CREATE TYPE "public"."timezone_enum" AS ENUM('America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"liens_found" integer DEFAULT 0,
	"liens_processed" integer DEFAULT 0,
	"liens_over_20k" integer DEFAULT 0,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "counties" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"airtable_county_id" text,
	"scraper_platform_id" varchar(50),
	"schedule_settings_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "county_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"county_id" varchar NOT NULL,
	"automation_run_id" varchar NOT NULL,
	"status" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"liens_found" integer DEFAULT 0,
	"liens_processed" integer DEFAULT 0,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "liens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"county_id" varchar NOT NULL,
	"recording_number" text NOT NULL,
	"record_date" date NOT NULL,
	"debtor_name" text NOT NULL,
	"debtor_address" text,
	"amount" numeric(12, 2) NOT NULL,
	"creditor_name" text,
	"creditor_address" text,
	"document_url" text,
	"pdf_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"airtable_record_id" text,
	"enrichment_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "liens_recording_number_unique" UNIQUE("recording_number")
);
--> statement-breakpoint
CREATE TABLE "schedule_settings" (
	"id" varchar(255) PRIMARY KEY DEFAULT 'global' NOT NULL,
	"name" text DEFAULT 'Default Schedule' NOT NULL,
	"hour" integer DEFAULT 5 NOT NULL,
	"minute" integer DEFAULT 0 NOT NULL,
	"timezone" timezone_enum DEFAULT 'America/New_York' NOT NULL,
	"skip_weekends" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scraper_platforms" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_config" jsonb,
	"has_captcha" boolean DEFAULT false NOT NULL,
	"requires_iframe" boolean DEFAULT false NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"message" text NOT NULL,
	"component" text NOT NULL,
	"metadata" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "counties" ADD CONSTRAINT "counties_scraper_platform_id_scraper_platforms_id_fk" FOREIGN KEY ("scraper_platform_id") REFERENCES "public"."scraper_platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counties" ADD CONSTRAINT "counties_schedule_settings_id_schedule_settings_id_fk" FOREIGN KEY ("schedule_settings_id") REFERENCES "public"."schedule_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "county_runs" ADD CONSTRAINT "county_runs_county_id_counties_id_fk" FOREIGN KEY ("county_id") REFERENCES "public"."counties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "county_runs" ADD CONSTRAINT "county_runs_automation_run_id_automation_runs_id_fk" FOREIGN KEY ("automation_run_id") REFERENCES "public"."automation_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liens" ADD CONSTRAINT "liens_county_id_counties_id_fk" FOREIGN KEY ("county_id") REFERENCES "public"."counties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");