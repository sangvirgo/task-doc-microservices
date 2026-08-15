ALTER TABLE "Task" ADD COLUMN "reviewer_id" TEXT;

CREATE INDEX "Task_reviewer_id_idx" ON "Task"("reviewer_id");

CREATE INDEX "TaskSubmission_task_id_created_at_idx"
ON "TaskSubmission"("task_id", "created_at");

UPDATE "Task"
SET "reviewer_id" = "creator_id"
WHERE "reviewer_id" IS NULL;
