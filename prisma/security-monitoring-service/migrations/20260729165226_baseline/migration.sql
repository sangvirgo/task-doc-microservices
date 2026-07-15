-- CreateTable
CREATE TABLE "SecurityAlert" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "actor_id" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rule_type" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 5,
    "window_minutes" INTEGER NOT NULL DEFAULT 15,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "action" TEXT NOT NULL DEFAULT 'ALERT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEventCounter" (
    "id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEventCounter_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "SecurityAlert_actor_id_idx" ON "SecurityAlert"("actor_id");

-- CreateIndex
CREATE INDEX "SecurityAlert_rule_id_idx" ON "SecurityAlert"("rule_id");

-- CreateIndex
CREATE INDEX "SecurityAlert_status_idx" ON "SecurityAlert"("status");

-- CreateIndex
CREATE INDEX "SecurityAlert_created_at_idx" ON "SecurityAlert"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityRule_name_key" ON "SecurityRule"("name");

-- CreateIndex
CREATE INDEX "SecurityEventCounter_rule_id_idx" ON "SecurityEventCounter"("rule_id");

-- CreateIndex
CREATE INDEX "SecurityEventCounter_actor_id_idx" ON "SecurityEventCounter"("actor_id");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityEventCounter_rule_id_actor_id_window_start_key" ON "SecurityEventCounter"("rule_id", "actor_id", "window_start");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumedEvent_event_id_key" ON "ConsumedEvent"("event_id");

-- CreateIndex
CREATE INDEX "ConsumedEvent_event_type_processed_at_idx" ON "ConsumedEvent"("event_type", "processed_at");
