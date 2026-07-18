-- CreateTable
CREATE TABLE "EncryptionRecord" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "object_key" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "signature" TEXT,
    "kek_version" INTEGER NOT NULL DEFAULT 1,
    "encrypted_dek" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "scan_status" TEXT NOT NULL DEFAULT 'PENDING',
    "scan_result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncryptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KekVersion" (
    "id" SERIAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KekVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EncryptionRecord_document_id_idx" ON "EncryptionRecord"("document_id");

-- CreateIndex
CREATE INDEX "EncryptionRecord_object_key_idx" ON "EncryptionRecord"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptionRecord_document_id_version_key" ON "EncryptionRecord"("document_id", "version");
