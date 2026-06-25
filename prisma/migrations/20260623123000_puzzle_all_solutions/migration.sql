-- Store every valid score assignment for ambiguous puzzles.
-- Existing rows are left null so application mappers can recompute exact
-- solution sets from standings and fixtures without trusting the old
-- single canonical solution as complete.
ALTER TABLE "puzzles" ADD COLUMN "allSolutions" JSONB;
