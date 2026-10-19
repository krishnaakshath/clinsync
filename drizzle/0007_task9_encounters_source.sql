-- Task 9 pre-dispatch fix: encounters was built in Task 1 as Tebra-only
-- (tebra_id NOT NULL, no source column), but the design spec's §4 "Native
-- creates" list explicitly includes POST /api/encounters inserting
-- source: 'clinsync', tebraId: null -- same as appointments/charges/
-- providers/insuranceClaims/documents. Correcting the schema to match
-- before Task 9 builds the native-create route against it.
--
-- All 18 existing encounters rows on the live dev DB are confirmed test
-- fixture pollution (tebra_id values literally prefixed "dupe-encounter-",
-- left over from Task 1's own fix-round tests) -- backfilling them to
-- source='clinsync' via the column default is harmless; there is no real
-- Tebra-synced encounter data in this environment yet (the Tebra account
-- itself still isn't working -- see today's live connectivity diagnostic).
ALTER TABLE "encounters" ADD COLUMN "source" "source" DEFAULT 'clinsync' NOT NULL;--> statement-breakpoint
ALTER TABLE "encounters" ALTER COLUMN "tebra_id" DROP NOT NULL;--> statement-breakpoint
DROP INDEX "encounters_tebra_id_unique_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "encounters_tebra_id_unique_idx" ON "encounters" USING btree ("tebra_id") WHERE "encounters"."tebra_id" is not null;
