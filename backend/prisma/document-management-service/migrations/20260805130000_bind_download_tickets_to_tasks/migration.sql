ALTER TABLE "DownloadTicket" ADD COLUMN "task_id" TEXT;

CREATE INDEX "DownloadTicket_task_id_idx" ON "DownloadTicket"("task_id");
