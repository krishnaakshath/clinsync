-- Task 1 Fix Round 1: review findings 1-3 (missing unique indexes on tebraId,
-- missing charges.encounterId -> encounters.id FK, missing syncCursors.practiceId
-- + composite unique constraint).
--
-- Data cleanup first: seed.ts's clearExistingData() never cleared the 6 new
-- Tebra-sync tables (Finding 4, fixed separately in src/db/seed.ts), so repeated
-- un-cleared test runs against this shared dev database have accumulated
-- duplicate fixture rows (same literal tebraId values such as 'test-encounter-1'
-- inserted more than once) in encounters, payments, serviceLocations, and
-- procedureCodes. The new unique indexes below cannot be created while those
-- duplicates exist, so dedupe first, keeping the lowest id (earliest-inserted
-- row) per duplicate tebra_id group. No other table's charges/children
-- reference these tables' deleted rows at migration time (verified against the
-- live dev DB: charges.encounter_id is NULL on every row), so this is safe.
DELETE FROM "encounters" a USING "encounters" b WHERE a."tebra_id" = b."tebra_id" AND a."id" > b."id";--> statement-breakpoint
DELETE FROM "payments" a USING "payments" b WHERE a."tebra_id" = b."tebra_id" AND a."id" > b."id";--> statement-breakpoint
DELETE FROM "service_locations" a USING "service_locations" b WHERE a."tebra_id" = b."tebra_id" AND a."id" > b."id";--> statement-breakpoint
DELETE FROM "procedure_codes" a USING "procedure_codes" b WHERE a."tebra_id" = b."tebra_id" AND a."id" > b."id";--> statement-breakpoint

-- Finding 3: syncCursors.practiceId (one row per entity type per practice,
-- per design spec section 3 and Task 7's getCursor/claimCursor/releaseCursor
-- contract). Added as nullable + backfilled + set NOT NULL rather than a
-- single NOT NULL ADD COLUMN, since sync_cursors already has rows on the live
-- dev DB and there is no natural default practiceId value. Backfilled rows are
-- pre-existing test fixtures only; a real sync run always supplies a real
-- practiceId going forward.
ALTER TABLE "sync_cursors" ADD COLUMN "practice_id" text;--> statement-breakpoint
UPDATE "sync_cursors" SET "practice_id" = 'unknown' WHERE "practice_id" IS NULL;--> statement-breakpoint
ALTER TABLE "sync_cursors" ALTER COLUMN "practice_id" SET NOT NULL;--> statement-breakpoint

-- Finding 2: charges.encounterId -> encounters.id (nullable FK)
ALTER TABLE "charges" ADD CONSTRAINT "charges_encounter_id_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."encounters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Finding 1: unique indexes on tebraId, preventing two sync runs from ever
-- double-inserting the same Tebra record. Partial (WHERE ... IS NOT NULL) for
-- the 5 tables where tebraId is nullable (clinsync-originated rows have no
-- Tebra id); plain for the 4 Tebra-only tables where tebraId is NOT NULL.
CREATE UNIQUE INDEX "appointments_tebra_id_unique_idx" ON "appointments" USING btree ("tebra_id") WHERE "appointments"."tebra_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "charges_tebra_id_unique_idx" ON "charges" USING btree ("tebra_id") WHERE "charges"."tebra_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "providers_tebra_id_unique_idx" ON "providers" USING btree ("tebra_id") WHERE "providers"."tebra_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_claims_tebra_id_unique_idx" ON "insurance_claims" USING btree ("tebra_id") WHERE "insurance_claims"."tebra_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_tebra_id_unique_idx" ON "documents" USING btree ("tebra_id") WHERE "documents"."tebra_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "encounters_tebra_id_unique_idx" ON "encounters" USING btree ("tebra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tebra_id_unique_idx" ON "payments" USING btree ("tebra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_locations_tebra_id_unique_idx" ON "service_locations" USING btree ("tebra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "procedure_codes_tebra_id_unique_idx" ON "procedure_codes" USING btree ("tebra_id");--> statement-breakpoint

-- Finding 3 (continued): dedup before the composite unique index below, for
-- the same reason as the Finding 1/4 dedups above -- every existing
-- sync_cursors row was just backfilled to practice_id='unknown' (line 28), so
-- any two rows that already shared an entity_type now collide on
-- (entity_type, practice_id) too. Verified against the live dev DB: 5 existing
-- rows, all entity_type='patient', all now practice_id='unknown' -- the
-- composite unique index below would fail outright without this. No other
-- table references sync_cursors (no FK to it anywhere in schema.ts), so
-- deleting duplicates here is safe. Keeps the lowest id (earliest-inserted
-- row) per duplicate (entity_type, practice_id) group, same convention as the
-- other dedups in this file.
DELETE FROM "sync_cursors" a USING "sync_cursors" b WHERE a."entity_type" = b."entity_type" AND a."practice_id" = b."practice_id" AND a."id" > b."id";--> statement-breakpoint

-- Finding 3 (continued): one row per entity type per practice
CREATE UNIQUE INDEX "sync_cursors_entity_type_practice_id_unique_idx" ON "sync_cursors" USING btree ("entity_type","practice_id");
