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
const { hashSync } = require('bcryptjs');

// ── Parse .env ──────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
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
const ADMIN_ID  = '00000000-0000-4000-a000-000000000001';
const EMP_ID    = '00000000-0000-4000-a000-000000000002';
const TASK_ID   = '00000000-0000-4000-b000-000000000001';
const DOC_ID    = '00000000-0000-4000-c000-000000000001';
const GRANT_ID  = '00000000-0000-4000-d000-000000000001';
const RECORD_ID = '00000000-0000-4000-c000-000000000010';
const RULE_ID   = '00000000-0000-4000-e000-000000000001';

const ADMIN_EMAIL = 'admin@c17.local';
const EMP_EMAIL   = 'employee@c17.local';
const ADMIN_PASS  = hashSync('Admin123!', 10);
const EMP_PASS    = hashSync('Employee123!', 10);

const NOW = new Date();
const EXPIRES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 days

// ── Helpers ─────────────────────────────────────────────────────────────────
function prismaClient(clientPkg, urlEnvKey) {
  const { PrismaClient } = require(clientPkg);
  return new PrismaClient({ datasources: { db: { url: process.env[urlEnvKey] } } });
}

async function disconnect(clients) {
  for (const c of clients) {
    try { await c.$disconnect(); } catch (_) { /* ignore */ }
  }
}

// ── Seed functions ──────────────────────────────────────────────────────────

async function seedAuth() {
  const prisma = prismaClient('@prisma/client-auth', 'AUTH_DATABASE_URL');
  try {
    for (const u of [
      { id: ADMIN_ID, email: ADMIN_EMAIL, password_hash: ADMIN_PASS, role: 'ADMIN' },
      { id: EMP_ID,   email: EMP_EMAIL,   password_hash: EMP_PASS,   role: 'EMPLOYEE' },
    ]) {
      await prisma.user.upsert({
        where: { email: u.email },
        create: u,
        update: { password_hash: u.password_hash, role: u.role },
      });
    }
    console.log('  auth_db: 2 users seeded');
    return prisma;
  } catch (e) { console.error('  auth_db ERROR:', e.message); return prisma; }
}

async function seedUserRole() {
  const prisma = prismaClient('@prisma/client-user-role', 'USER_ROLE_DATABASE_URL');
  try {
    for (const u of [
      { id: ADMIN_ID, email: ADMIN_EMAIL, role: 'ADMIN' },
      { id: EMP_ID,   email: EMP_EMAIL,   role: 'EMPLOYEE' },
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
    console.log('  user_role_db: 2 users + 1 capability seeded');
    return prisma;
  } catch (e) { console.error('  user_role_db ERROR:', e.message); return prisma; }
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
        creator_id: ADMIN_ID,
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
      create: { id: commentId, task_id: TASK_ID, author_id: ADMIN_ID, content: 'Please review the attached documents before the deadline.' },
      update: {},
    });
    // Status history
    const histId = '00000000-0000-4000-b000-000000000020';
    await prisma.taskStatusHistory.upsert({
      where: { id: histId },
      create: { id: histId, task_id: TASK_ID, from_status: 'CREATED', to_status: 'IN_PROGRESS', changed_by: ADMIN_ID },
      update: {},
    });
    console.log('  task_db: 1 task + participant + comment + history seeded');
    return prisma;
  } catch (e) { console.error('  task_db ERROR:', e.message); return prisma; }
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
    console.log('  document_db: 1 document + version + record seeded');
    return prisma;
  } catch (e) { console.error('  document_db ERROR:', e.message); return prisma; }
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
    console.log('  document_security_db: KEK v1 seeded');
    return prisma;
  } catch (e) { console.error('  document_security_db ERROR:', e.message); return prisma; }
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
        permissions: ['VIEW', 'DOWNLOAD'],
        task_id: TASK_ID,
        expires_at: EXPIRES,
        effective_expires_at: EXPIRES,
        status: 'ACTIVE',
      },
      update: {},
    });
    console.log('  permission_db: 1 grant seeded');
    return prisma;
  } catch (e) { console.error('  permission_db ERROR:', e.message); return prisma; }
}

async function seedAudit() {
  const prisma = prismaClient('@prisma/client-audit', 'AUDIT_DATABASE_URL');
  try {
    // Ensure ChainHead singleton
    await prisma.chainHead.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', last_hash: '', sequence: 0 },
      update: {},
    });
    console.log('  audit_db: chain head initialized');
    return prisma;
  } catch (e) { console.error('  audit_db ERROR:', e.message); return prisma; }
}

async function seedNotification() {
  const prisma = prismaClient('@prisma/client-notification', 'NOTIFICATION_DATABASE_URL');
  try {
    const notifId1 = '00000000-0000-4000-f000-000000000001';
    const notifId2 = '00000000-0000-4000-f000-000000000002';
    for (const n of [
      { id: notifId1, recipient_id: ADMIN_ID, type: 'SYSTEM', title: 'Welcome', body: 'Welcome to C17 Document Management, Admin.', channel: 'IN_APP' },
      { id: notifId2, recipient_id: EMP_ID, type: 'SYSTEM', title: 'Welcome', body: 'Welcome to C17 Document Management. You have been assigned the ARCHIVE_SUBMIT capability.', channel: 'IN_APP' },
    ]) {
      await prisma.notification.upsert({
        where: { id: n.id },
        create: n,
        update: {},
      });
    }
    // Preferences
    for (const p of [
      { user_id: ADMIN_ID },
      { user_id: EMP_ID },
    ]) {
      await prisma.notificationPreference.upsert({
        where: { user_id: p.user_id },
        create: p,
        update: {},
      });
    }
    console.log('  notification_db: 2 notifications + 2 preferences seeded');
    return prisma;
  } catch (e) { console.error('  notification_db ERROR:', e.message); return prisma; }
}

async function seedSecurityMonitoring() {
  const prisma = prismaClient('@prisma/client-security-monitoring', 'SECURITY_MONITORING_DATABASE_URL');
  try {
    await prisma.securityRule.upsert({
      where: { name: 'excessive-permission-checks' },
      create: {
        id: RULE_ID,
        name: 'excessive-permission-checks',
        description: 'Triggers when a user makes too many permission check requests in a short window.',
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
  } catch (e) { console.error('  security_monitoring_db ERROR:', e.message); return prisma; }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Seeding all 9 databases...');
  console.log(`  Admin:    ${ADMIN_EMAIL} / Admin123!`);
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
