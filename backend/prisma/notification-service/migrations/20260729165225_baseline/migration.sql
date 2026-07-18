-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Notification_recipient_id_idx" ON "Notification"("recipient_id");

-- CreateIndex
CREATE INDEX "Notification_created_at_idx" ON "Notification"("created_at");

-- CreateIndex
CREATE INDEX "Notification_read_at_idx" ON "Notification"("read_at");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_user_id_key" ON "NotificationPreference"("user_id");

-- CreateIndex
CREATE INDEX "NotificationPreference_user_id_idx" ON "NotificationPreference"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumedEvent_event_id_key" ON "ConsumedEvent"("event_id");

-- CreateIndex
CREATE INDEX "ConsumedEvent_event_type_processed_at_idx" ON "ConsumedEvent"("event_type", "processed_at");
