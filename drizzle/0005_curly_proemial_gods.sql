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
ALTER TABLE "appointments" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "charges" ADD COLUMN "encounter_id" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "blob_key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "uploaded_by" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "patient_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "insurance_claims" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "tebra_id" text;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_charge_id_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."charges"("id") ON DELETE no action ON UPDATE no action;
