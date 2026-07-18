-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "creator_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "parent_task_id" TEXT,
    "deadline" TIMESTAMP(3),
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "previous_status" TEXT,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "task_id" TEXT,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "producer" TEXT NOT NULL,
    "actor_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskParticipant" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStatusHistory" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "activity_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewer_id" TEXT,
    "review_comment" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_creator_id_idx" ON "Task"("creator_id");

-- CreateIndex
CREATE INDEX "Task_assignee_id_idx" ON "Task"("assignee_id");

-- CreateIndex
CREATE INDEX "Task_parent_task_id_idx" ON "Task"("parent_task_id");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_deadline_idx" ON "Task"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_event_id_key" ON "OutboxEvent"("event_id");

-- CreateIndex
CREATE INDEX "OutboxEvent_published_at_available_at_created_at_idx" ON "OutboxEvent"("published_at", "available_at", "created_at");

-- CreateIndex
CREATE INDEX "OutboxEvent_task_id_idx" ON "OutboxEvent"("task_id");

-- CreateIndex
CREATE INDEX "TaskParticipant_user_id_idx" ON "TaskParticipant"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "TaskParticipant_task_id_user_id_key" ON "TaskParticipant"("task_id", "user_id");

-- CreateIndex
CREATE INDEX "TaskComment_task_id_idx" ON "TaskComment"("task_id");

-- CreateIndex
CREATE INDEX "TaskComment_author_id_idx" ON "TaskComment"("author_id");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_task_id_idx" ON "TaskStatusHistory"("task_id");

-- CreateIndex
CREATE INDEX "TaskActivity_task_id_idx" ON "TaskActivity"("task_id");

-- CreateIndex
CREATE INDEX "TaskActivity_created_at_idx" ON "TaskActivity"("created_at");

-- CreateIndex
CREATE INDEX "TaskSubmission_task_id_idx" ON "TaskSubmission"("task_id");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskParticipant" ADD CONSTRAINT "TaskParticipant_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSubmission" ADD CONSTRAINT "TaskSubmission_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
