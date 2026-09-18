ALTER TABLE "audit_log" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "access_token" text;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD COLUMN "token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_access_token_unique" UNIQUE("access_token");