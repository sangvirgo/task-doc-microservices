CREATE TABLE "PreviewSession" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "task_id" TEXT,
    "version" INTEGER NOT NULL,
    "actor_id" TEXT NOT NULL,
    "security_preview_id" TEXT NOT NULL,
    "page_count" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "page_requests" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PreviewSession_document_id_idx" ON "PreviewSession"("document_id");
CREATE INDEX "PreviewSession_actor_id_idx" ON "PreviewSession"("actor_id");
CREATE INDEX "PreviewSession_expires_at_idx" ON "PreviewSession"("expires_at");
CREATE INDEX "PreviewSession_security_preview_id_idx" ON "PreviewSession"("security_preview_id");
