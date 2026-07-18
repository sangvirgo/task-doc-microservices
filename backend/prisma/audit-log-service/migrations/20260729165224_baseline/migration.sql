-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "actor_id" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "previous_hash" TEXT NOT NULL,
    "current_hash" TEXT NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainHead" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "last_hash" TEXT NOT NULL DEFAULT '',
    "last_event_id" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainHead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_sequence_number_key" ON "AuditEvent"("sequence_number");

-- CreateIndex
CREATE INDEX "AuditEvent_occurred_at_idx" ON "AuditEvent"("occurred_at");

-- CreateIndex
CREATE INDEX "AuditEvent_resource_type_resource_id_idx" ON "AuditEvent"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "AuditEvent_actor_id_idx" ON "AuditEvent"("actor_id");

-- CreateIndex
CREATE INDEX "AuditEvent_event_type_idx" ON "AuditEvent"("event_type");
