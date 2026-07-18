-- CreateTable
CREATE TABLE "Grant" (
    "id" TEXT NOT NULL,
    "grantor_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "permissions" TEXT[],
    "task_id" TEXT NOT NULL,
    "parent_grant_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "effective_expires_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumedEvent" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ConsumedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Grant_actor_id_idx" ON "Grant"("actor_id");

-- CreateIndex
CREATE INDEX "Grant_resource_id_idx" ON "Grant"("resource_id");

-- CreateIndex
CREATE INDEX "Grant_task_id_idx" ON "Grant"("task_id");

-- CreateIndex
CREATE INDEX "Grant_parent_grant_id_idx" ON "Grant"("parent_grant_id");

-- CreateIndex
CREATE INDEX "Grant_effective_expires_at_idx" ON "Grant"("effective_expires_at");

-- CreateIndex
CREATE INDEX "Grant_status_idx" ON "Grant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumedEvent_event_id_key" ON "ConsumedEvent"("event_id");

-- CreateIndex
CREATE INDEX "ConsumedEvent_event_type_processed_at_idx" ON "ConsumedEvent"("event_type", "processed_at");

-- AddForeignKey
ALTER TABLE "Grant" ADD CONSTRAINT "Grant_parent_grant_id_fkey" FOREIGN KEY ("parent_grant_id") REFERENCES "Grant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
