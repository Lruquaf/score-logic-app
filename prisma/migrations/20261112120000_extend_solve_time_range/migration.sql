-- Long-running attempts remain playable. Derived difficulty observations must
-- accept the same time range as the PostgreSQL Int-backed attempt timestamps.
ALTER TABLE "puzzle_difficulty_observations"
  DROP CONSTRAINT "puzzle_difficulty_observations_solve_time",
  ADD CONSTRAINT "puzzle_difficulty_observations_solve_time"
  CHECK (
    ("solvedAttemptCount" = 0 AND "medianSolveTimeSec" IS NULL AND "p75SolveTimeSec" IS NULL) OR
    (
      "solvedAttemptCount" > 0 AND
      "medianSolveTimeSec" >= 0 AND
      "p75SolveTimeSec" >= "medianSolveTimeSec"
    )
  );
