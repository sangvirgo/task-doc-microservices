-- CreateTable
CREATE TABLE "TaskDocument" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "attached_by" TEXT NOT NULL,
    "attached_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskDocument_task_id_document_id_key" ON "TaskDocument"("task_id", "document_id");

-- CreateIndex
CREATE INDEX "TaskDocument_task_id_idx" ON "TaskDocument"("task_id");

-- CreateIndex
CREATE INDEX "TaskDocument_document_id_idx" ON "TaskDocument"("document_id");

-- AddForeignKey
ALTER TABLE "TaskDocument" ADD CONSTRAINT "TaskDocument_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
