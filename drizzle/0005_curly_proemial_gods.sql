CREATE TYPE "public"."document_type" AS ENUM('other', 'drivers_license', 'legal_document', 'insurance_card_primary_front', 'insurance_card_primary_back', 'insurance_card_secondary_front', 'insurance_card_secondary_back', 'insurance_eob', 'insurance_authorization', 'imaging_result');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('tebra', 'clinsync');--> statement-breakpoint
CREATE TYPE "public"."sync_cursor_entity" AS ENUM('patient', 'appointment', 'charge', 'payment', 'provider', 'serviceLocation', 'procedureCode');--> statement-breakpoint
CREATE TYPE "public"."sync_outcome" AS ENUM('ok', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('idle', 'running', 'failed');--> statement-breakpoint
CREATE TABLE "encounters" (
	"id" serial PRIMARY KEY NOT NULL,
	"tebra_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"provider_id" integer NOT NULL,
	"service_location_id" integer NOT NULL,
	"service_start_date" date NOT NULL,
	"service_end_date" date NOT NULL,
	"status" "appointment_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_chart_discrepancies" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"form_submission_id" integer NOT NULL,
	"question_id" text NOT NULL,
	"question_label" text NOT NULL,
	"patient_answer" text NOT NULL,
	"chart_finding" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"sender_role" text NOT NULL,
	"sender_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_by_patient_at" timestamp,
	"read_by_provider_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tebra_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"charge_id" integer,
	"payer_name" text NOT NULL,
	"payer_type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"posted_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tebra_id" text NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tebra_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "sync_cursor_entity" NOT NULL,
	"last_synced_at" timestamp NOT NULL,
	"status" "sync_status" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "sync_cursor_entity" NOT NULL,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"records_processed" integer NOT NULL,
	"outcome" "sync_outcome" NOT NULL,
	"error_kind" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "practice_name" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "practice_site" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "practice_timezone" text DEFAULT 'America/Los_Angeles';--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "intakeq_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tebra_customer_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tebra_user_encrypted" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tebra_password_encrypted" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "admin_mfa_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "admin_mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "encounter_id" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "document_type" "document_type" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "blob_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "uploaded_by" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "patient_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "portal_password_hash" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "mfa_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "dob" date NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "zip" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "screening_criteria_results" ADD COLUMN "criterion_type" text;--> statement-breakpoint
ALTER TABLE "trials" ADD COLUMN "exclusion_diagnoses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "trials" ADD COLUMN "min_rating_scale_score" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_chart_discrepancies" ADD CONSTRAINT "form_chart_discrepancies_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_chart_discrepancies" ADD CONSTRAINT "form_chart_discrepancies_form_submission_id_form_submissions_id_fk" FOREIGN KEY ("form_submission_id") REFERENCES "public"."form_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN "label";--> statement-breakpoint
DROP TYPE "public"."document_label";