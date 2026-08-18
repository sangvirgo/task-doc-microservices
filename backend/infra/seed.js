#!/usr/bin/env node
/**
 * Idempotent seed script for all 9 databases.
 * Run: node infra/seed.js
 *
 * Parses .env for DATABASE_URLs, uses Prisma generated clients directly.
 * Safe to re-run — uses upsert / createMany with skipDuplicates.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hashSync } = require('bcryptjs');
const { Client: MinioClient } = require('minio');

// ── Parse .env ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envDir = path.resolve(__dirname, '..');
  const envPath = fs.existsSync(path.join(envDir, '.env'))
    ? path.join(envDir, '.env')
    : path.join(envDir, '.env.example');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ── Fixed IDs (idempotent) ──────────────────────────────────────────────────
const ADMIN_ID = '00000000-0000-4000-a000-000000000001';
const EMP_ID = '00000000-0000-4000-a000-000000000002';
const ADMIN2_ID = '00000000-0000-4000-a000-000000000003';
const TASK_ID = '00000000-0000-4000-b000-000000000001';
const DOC_ID = '00000000-0000-4000-c000-000000000001';
const GRANT_ID = '00000000-0000-4000-d000-000000000001';
const RECORD_ID = '00000000-0000-4000-c000-000000000010';
const RULE_ID = '00000000-0000-4000-e000-000000000001';

const ADMIN_EMAIL = 'n22dccn088@student.ptithcm.edu.vn';
const EMP_EMAIL = 'employee@c17.local';
const ADMIN2_EMAIL = 'n22dccn068@student.ptithcm.edu.vn';
const ADMIN_PASS = hashSync('Admin123!', 10);
const EMP_PASS = hashSync('Employee123!', 10);
const ADMIN2_PASS = hashSync('n22dccn068@student.ptithcm.edu.vn', 10);

const NOW = new Date();
const EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

// ── Helpers ─────────────────────────────────────────────────────────────────
function prismaClient(clientPkg, urlEnvKey) {
  const { PrismaClient } = require(clientPkg);
  return new PrismaClient({ datasources: { db: { url: process.env[urlEnvKey] } } });
}

async function disconnect(clients) {
  for (const c of clients) {
    try {
      await c.$disconnect();
    } catch (_) {
      /* ignore */
    }
  }
}

// ── Seed functions ──────────────────────────────────────────────────────────

async function seedAuth() {
  const prisma = prismaClient('@prisma/client-auth', 'AUTH_DATABASE_URL');
  try {
    for (const u of [
      { id: ADMIN_ID, email: ADMIN_EMAIL, password_hash: ADMIN_PASS, role: 'ADMIN', email_verified_at: new Date() },
      { id: EMP_ID, email: EMP_EMAIL, password_hash: EMP_PASS, role: 'EMPLOYEE', email_verified_at: new Date() },
      { id: ADMIN2_ID, email: ADMIN2_EMAIL, password_hash: ADMIN2_PASS, role: 'ADMIN', email_verified_at: new Date() },
    ]) {
      await prisma.user.upsert({
        where: { email: u.email },
        create: u,
        update: { password_hash: u.password_hash, role: u.role, email_verified_at: new Date() },
      });
    }
    console.log('  auth_db: 3 users seeded');
    return prisma;
  } catch (e) {
    console.error('  auth_db ERROR:', e.message);
    throw e;
  }
}

async function seedUserRole() {
  const prisma = prismaClient('@prisma/client-user-role', 'USER_ROLE_DATABASE_URL');
  try {
    for (const u of [
      { id: ADMIN_ID, email: ADMIN_EMAIL, role: 'ADMIN' },
      { id: EMP_ID, email: EMP_EMAIL, role: 'EMPLOYEE' },
      { id: ADMIN2_ID, email: ADMIN2_EMAIL, role: 'ADMIN' },
    ]) {
      await prisma.user.upsert({
        where: { id: u.id },
        create: u,
        update: { email: u.email, role: u.role },
      });
    }
    // Employee gets ARCHIVE_SUBMIT (ADMIN cannot hold capabilities per V3 §5.2.2)
    await prisma.capability.upsert({
      where: { user_id_capability: { user_id: EMP_ID, capability: 'ARCHIVE_SUBMIT' } },
      create: { user_id: EMP_ID, capability: 'ARCHIVE_SUBMIT' },
      update: {},
    });
    console.log('  user_role_db: 3 users + 1 capability seeded');
    return prisma;
  } catch (e) {
    console.error('  user_role_db ERROR:', e.message);
    throw e;
  }
}

async function seedTask() {
  const prisma = prismaClient('@prisma/client-task', 'TASK_DATABASE_URL');
  try {
    await prisma.task.upsert({
      where: { id: TASK_ID },
      create: {
        id: TASK_ID,
        title: 'Review Q3 Archive Package',
        description: 'Review and approve the Q3 document archive transfer package.',
        status: 'IN_PROGRESS',
        creator_id: EMP_ID,
        assignee_id: EMP_ID,
        deadline: EXPIRES,
      },
      update: {},
    });
    // Participant
    await prisma.taskParticipant.upsert({
      where: { task_id_user_id: { task_id: TASK_ID, user_id: EMP_ID } },
      create: { task_id: TASK_ID, user_id: EMP_ID, role: 'ASSIGNEE' },
      update: {},
    });
    // Comment
    const commentId = '00000000-0000-4000-b000-000000000010';
    await prisma.taskComment.upsert({
      where: { id: commentId },
      create: {
        id: commentId,
        task_id: TASK_ID,
        author_id: EMP_ID,
        content: 'Please review the attached documents before the deadline.',
      },
      update: {},
    });
    // Status history
    const histId = '00000000-0000-4000-b000-000000000020';
    await prisma.taskStatusHistory.upsert({
      where: { id: histId },
      create: {
        id: histId,
        task_id: TASK_ID,
        from_status: 'CREATED',
        to_status: 'IN_PROGRESS',
        changed_by: EMP_ID,
      },
      update: {},
    });
    console.log('  task_db: 1 task + participant + comment + history seeded');
    return prisma;
  } catch (e) {
    console.error('  task_db ERROR:', e.message);
    throw e;
  }
}

async function seedDocument() {
  const prisma = prismaClient('@prisma/client-document', 'DOCUMENT_DATABASE_URL');
  try {
    await prisma.document.upsert({
      where: { id: DOC_ID },
      create: {
        id: DOC_ID,
        title: 'Q3 Financial Report',
        document_type: 'REPORT',
        owner_id: ADMIN_ID,
        creator_id: ADMIN_ID,
        security_level: 'CONFIDENTIAL',
        status: 'UPLOADED',
        current_version: 1,
      },
      update: {},
    });
    const versionId = '00000000-0000-4000-c000-000000000002';
    await prisma.documentVersion.upsert({
      where: { document_id_version: { document_id: DOC_ID, version: 1 } },
      create: {
        id: versionId,
        document_id: DOC_ID,
        version: 1,
        object_key: 'documents/seed/q3-financial-report-v1.pdf',
        checksum: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        kek_version: 1,
        encrypted_dek: 'seed-encrypted-dek-placeholder',
        file_size: 102400,
        mime_type: 'application/pdf',
        created_by: ADMIN_ID,
      },
      update: {},
    });
    await prisma.taskDocument.upsert({
      where: { task_id_document_id: { task_id: TASK_ID, document_id: DOC_ID } },
      create: {
        task_id: TASK_ID,
        document_id: DOC_ID,
        attached_by: ADMIN_ID,
      },
      update: {},
    });
    // Record
    await prisma.record.upsert({
      where: { id: RECORD_ID },
      create: {
        id: RECORD_ID,
        title: 'Q3 Archive Record',
        description: 'Archive record for Q3 financial documents.',
        status: 'DRAFT',
        creator_id: ADMIN_ID,
      },
      update: {},
    });
    console.log('  document_db: 1 document + version + task association + record seeded');
    return prisma;
  } catch (e) {
    console.error('  document_db ERROR:', e.message);
    throw e;
  }
}

async function seedDocumentSecurity() {
  const prisma = prismaClient('@prisma/client-document-security', 'DOCUMENT_SECURITY_DATABASE_URL');
  try {
    // Ensure KEK v1 exists
    await prisma.kekVersion.upsert({
      where: { id: 1 },
      create: { id: 1, active: true },
      update: {},
    });
    await seedDemoDocumentContent(prisma);
    console.log('  document_security_db: KEK v1 seeded + demo document content encrypted');
    return prisma;
  } catch (e) {
    console.error('  document_security_db ERROR:', e.message);
    throw e;
  }
}

/**
 * Give the seeded "Q3 Financial Report" a real, decryptable file so the demo can
 * preview and download it. Mirrors the document-security-service pipeline exactly:
 * AES-256-GCM with a random DEK, DEK wrapped by the sha256-derived KEK, plaintext
 * sha256 checksum, and an HMAC-SHA256 integrity signature.
 */
async function seedDemoDocumentContent(securityPrisma) {
  const docPrisma = prismaClient('@prisma/client-document', 'DOCUMENT_DATABASE_URL');

  const kekSecret = process.env.DOCUMENT_KEK_V1 || 'b211f9500ad1bba9c484eb8d5c333b6be40e137bc7a86258fd2d92985127baa4';
  const signatureKey = process.env.DOCUMENT_SIGNATURE_KEY || '';
  const kekVersion = Number(process.env.DOCUMENT_ACTIVE_KEK_VERSION || 1);
  const kek = crypto.createHash('sha256').update(kekSecret, 'utf8').digest();

  const plaintext = Buffer.from(
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj',
      '4 0 obj << /Length 74 >> stream',
      'BT /F1 24 Tf 72 720 Td (Q3 Financial Report - C17 Demo) Tj ET',
      'endstream endobj',
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
      'xref',
      '0 6',
      '0000000000 65535 f ',
      '0000000009 00000 n ',
      '0000000058 00000 n ',
      '0000000115 00000 n ',
      '0000000261 00000 n ',
      '0000000389 00000 n ',
      'trailer << /Root 1 0 R /Size 6 >>',
      'startxref',
      '475',
      '%%EOF',
    ].join('\n'),
    'utf8',
  );

  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const wrapIv = crypto.randomBytes(12);
  const wrapCipher = crypto.createCipheriv('aes-256-gcm', kek, wrapIv);
  const wrapped = Buffer.concat([wrapCipher.update(dek), wrapCipher.final()]);
  const wrapTag = wrapCipher.getAuthTag();
  const encryptedDek = JSON.stringify({
    iv: wrapIv.toString('base64'),
    auth_tag: wrapTag.toString('base64'),
    ciphertext: wrapped.toString('base64'),
  });

  const objectKey = 'documents/seed/q3-financial-report-v1.pdf';
  const checksum = crypto.createHash('sha256').update(plaintext).digest('hex');
  const signaturePayload = JSON.stringify({
    document_id: DOC_ID,
    version: 1,
    object_key: objectKey,
    checksum,
    encrypted_dek: encryptedDek,
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
    kek_version: kekVersion,
    file_size: plaintext.length,
    mime_type: 'application/pdf',
  });
  const signature = crypto.createHmac('sha256', signatureKey).update(signaturePayload, 'utf8').digest('base64');

  const minioEndpoint = process.env.MINIO_ENDPOINT || 'minio';
  const minioPort = Number(process.env.MINIO_PORT || 9000);
  const minioBucket = process.env.MINIO_BUCKET || 'documents';
  const client = new MinioClient({
    endPoint: minioEndpoint,
    port: minioPort,
    useSSL: String(process.env.MINIO_USE_SSL || 'false') === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });

  const bucketExists = await client.bucketExists(minioBucket);
  if (!bucketExists) await client.makeBucket(minioBucket);
  await client.putObject(minioBucket, objectKey, ciphertext, ciphertext.length);

  await securityPrisma.encryptionRecord.upsert({
    where: { document_id_version: { document_id: DOC_ID, version: 1 } },
    create: {
      document_id: DOC_ID,
      version: 1,
      object_key: objectKey,
      checksum,
      signature,
      kek_version: kekVersion,
      encrypted_dek: encryptedDek,
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
      file_size: plaintext.length,
      mime_type: 'application/pdf',
      scan_status: 'CLEAN',
      scan_result: 'OK',
    },
    update: {
      object_key: objectKey,
      checksum,
      signature,
      kek_version: kekVersion,
      encrypted_dek: encryptedDek,
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
      file_size: plaintext.length,
      mime_type: 'application/pdf',
      scan_status: 'CLEAN',
      scan_result: 'OK',
    },
  });

  await docPrisma.documentVersion.update({
    where: { document_id_version: { document_id: DOC_ID, version: 1 } },
    data: {
      object_key: objectKey,
      checksum: `sha256:${checksum}`,
      file_size: plaintext.length,
      mime_type: 'application/pdf',
    },
  });
  await docPrisma.$disconnect();
}

async function seedPermission() {
  const prisma = prismaClient('@prisma/client-permission', 'PERMISSION_DATABASE_URL');
  try {
    await prisma.grant.upsert({
      where: { id: GRANT_ID },
      create: {
        id: GRANT_ID,
        grantor_id: ADMIN_ID,
        actor_id: EMP_ID,
        resource_type: 'DOCUMENT',
        resource_id: DOC_ID,
        permissions: ['PREVIEW', 'DOWNLOAD'],
        task_id: TASK_ID,
        expires_at: EXPIRES,
        effective_expires_at: EXPIRES,
        status: 'ACTIVE',
      },
      update: {},
    });
    console.log('  permission_db: 1 grant seeded');
    return prisma;
  } catch (e) {
    console.error('  permission_db ERROR:', e.message);
    throw e;
  }
}

async function seedAudit() {
  const prisma = prismaClient('@prisma/client-audit', 'AUDIT_DATABASE_URL');
  try {
    // Ensure ChainHead singleton
    await prisma.chainHead.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', last_hash: '', sequence: 0 },
      update: { last_hash: '', last_event_id: null, sequence: 0 },
    });
    console.log('  audit_db: chain head initialized');
    return prisma;
  } catch (e) {
    console.error('  audit_db ERROR:', e.message);
    throw e;
  }
}

async function seedNotification() {
  const prisma = prismaClient('@prisma/client-notification', 'NOTIFICATION_DATABASE_URL');
  try {
    const notifId1 = '00000000-0000-4000-f000-000000000001';
    const notifId2 = '00000000-0000-4000-f000-000000000002';
    for (const n of [
      {
        id: notifId1,
        recipient_id: ADMIN_ID,
        type: 'SYSTEM',
        title: 'Welcome',
        body: 'Welcome to C17 Document Management, Admin.',
        channel: 'IN_APP',
      },
      {
        id: notifId2,
        recipient_id: EMP_ID,
        type: 'SYSTEM',
        title: 'Welcome',
        body: 'Welcome to C17 Document Management. You have been assigned the ARCHIVE_SUBMIT capability.',
        channel: 'IN_APP',
      },
    ]) {
      await prisma.notification.upsert({
        where: { id: n.id },
        create: n,
        update: {},
      });
    }
    // Preferences
    for (const p of [{ user_id: ADMIN_ID }, { user_id: EMP_ID }]) {
      await prisma.notificationPreference.upsert({
        where: { user_id: p.user_id },
        create: p,
        update: {},
      });
    }
    console.log('  notification_db: 2 notifications + 2 preferences seeded');
    return prisma;
  } catch (e) {
    console.error('  notification_db ERROR:', e.message);
    throw e;
  }
}

async function seedSecurityMonitoring() {
  const prisma = prismaClient(
    '@prisma/client-security-monitoring',
    'SECURITY_MONITORING_DATABASE_URL',
  );
  try {
    await prisma.securityRule.upsert({
      where: { name: 'excessive-permission-checks' },
      create: {
        id: RULE_ID,
        name: 'excessive-permission-checks',
        description:
          'Triggers when a user makes too many permission check requests in a short window.',
        rule_type: 'RATE_LIMIT',
        threshold: 10,
        window_minutes: 5,
        enabled: true,
        action: 'ALERT',
      },
      update: {},
    });
    console.log('  security_monitoring_db: 1 rule seeded');
    return prisma;
  } catch (e) {
    console.error('  security_monitoring_db ERROR:', e.message);
    throw e;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Seeding all 9 databases...');
  console.log(`  Admin:    ${ADMIN_EMAIL} / Admin123!`);
  console.log(`  Admin2:   ${ADMIN2_EMAIL} / ${ADMIN2_EMAIL}`);
  console.log(`  Employee: ${EMP_EMAIL} / Employee123!`);
  console.log('');

  const clients = await Promise.all([
    seedAuth(),
    seedUserRole(),
    seedTask(),
    seedDocument(),
    seedDocumentSecurity(),
    seedPermission(),
    seedAudit(),
    seedNotification(),
    seedSecurityMonitoring(),
  ]);

  console.log('\nSeed complete.');
  await disconnect(clients);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
