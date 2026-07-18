-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "security_level" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "retention_policy" TEXT,
    "retention_expires_at" TIMESTAMP(3),
    "archive_status" TEXT,
    "disposal_status" TEXT,
    "record_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "document_id" TEXT,
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
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "signature" TEXT,
    "kek_version" INTEGER NOT NULL DEFAULT 1,
    "encrypted_dek" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Record" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "creator_id" TEXT NOT NULL,
    "sealed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordEntry" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "document_version_id" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferPackage" (
    "id" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "submitter_id" TEXT,
    "archivist_id" TEXT,
    "manifest" JSONB,
    "metadata" JSONB,
    "checksums" JSONB,
    "package_checksum" TEXT,
    "signature" TEXT,
    "rejection_reason" TEXT,
    "receipt" JSONB,
    "audit_references" JSONB,
    "submitted_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadTicket" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actor_id" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownloadTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisposalApproval" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "approver_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "DisposalApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionHold" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placed_by" TEXT NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),

    CONSTRAINT "RetentionHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_owner_id_idx" ON "Document"("owner_id");

-- CreateIndex
CREATE INDEX "Document_creator_id_idx" ON "Document"("creator_id");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_record_id_idx" ON "Document"("record_id");

-- CreateIndex
CREATE INDEX "Document_retention_expires_at_idx" ON "Document"("retention_expires_at");

-- CreateIndex
CREATE INDEX "Document_disposal_status_idx" ON "Document"("disposal_status");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_event_id_key" ON "OutboxEvent"("event_id");

-- CreateIndex
CREATE INDEX "OutboxEvent_published_at_available_at_created_at_idx" ON "OutboxEvent"("published_at", "available_at", "created_at");

-- CreateIndex
CREATE INDEX "OutboxEvent_document_id_idx" ON "OutboxEvent"("document_id");

-- CreateIndex
CREATE INDEX "DocumentVersion_document_id_idx" ON "DocumentVersion"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_document_id_version_key" ON "DocumentVersion"("document_id", "version");

-- CreateIndex
CREATE INDEX "Record_creator_id_idx" ON "Record"("creator_id");

-- CreateIndex
CREATE INDEX "Record_status_idx" ON "Record"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RecordEntry_record_id_document_id_document_version_id_key" ON "RecordEntry"("record_id", "document_id", "document_version_id");

-- CreateIndex
CREATE INDEX "TransferPackage_record_id_idx" ON "TransferPackage"("record_id");

-- CreateIndex
CREATE INDEX "TransferPackage_status_idx" ON "TransferPackage"("status");

-- CreateIndex
CREATE INDEX "TransferPackage_submitter_id_idx" ON "TransferPackage"("submitter_id");

-- CreateIndex
CREATE INDEX "DownloadTicket_document_id_idx" ON "DownloadTicket"("document_id");

-- CreateIndex
CREATE INDEX "DownloadTicket_actor_id_idx" ON "DownloadTicket"("actor_id");

-- CreateIndex
CREATE INDEX "DownloadTicket_expires_at_idx" ON "DownloadTicket"("expires_at");

-- CreateIndex
CREATE INDEX "DisposalApproval_document_id_idx" ON "DisposalApproval"("document_id");

-- CreateIndex
CREATE INDEX "DisposalApproval_approver_id_idx" ON "DisposalApproval"("approver_id");

-- CreateIndex
CREATE INDEX "RetentionHold_document_id_idx" ON "RetentionHold"("document_id");

-- CreateIndex
CREATE INDEX "RetentionHold_released_at_idx" ON "RetentionHold"("released_at");

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEntry" ADD CONSTRAINT "RecordEntry_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferPackage" ADD CONSTRAINT "TransferPackage_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "Record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
