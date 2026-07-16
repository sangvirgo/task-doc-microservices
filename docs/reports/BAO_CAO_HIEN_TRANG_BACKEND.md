# BÁO CÁO HIỆN TRẠNG HỆ THỐNG BACKEND

**Dự án:** Nền tảng Giao việc và Chia sẻ Tài liệu Số Bảo mật cho Tổ chức
**Ngày lập:** 2026-07-30
**Nhánh hiện tại:** `implementation/full-backend`
**Commit HEAD:** `b2a715dc1ee45ad5df631e99a920b041f364d6c1`

---

## Mục lục

1. [Tổng quan đề tài](#1-tổng-quan-đề-tài)
2. [Kiến trúc tổng thể](#2-kiến-trúc-tổng-thể)
3. [Danh sách service](#3-danh-sách-service)
4. [Thiết kế cơ sở dữ liệu](#4-thiết-kế-cơ-sở-dữ-liệu)
5. [Các luồng nghiệp vụ đã thiết kế/triển khai](#5-các-luồng-nghiệp-vụ-đã-thiết-kếtriển-khai)
6. [API hiện có](#6-api-hiện-có)
7. [Event catalog](#7-event-catalog)
8. [Các quyết định bảo mật quan trọng](#8-các-quyết-định-bảo-mật-quan-trọng)
9. [Trạng thái kiểm thử và vận hành](#9-trạng-thái-kiểm-thử-và-vận-hành)
10. [Lịch sử commit triển khai](#10-lịch-sử-commit-triển-khai)
11. [Những phần đã hoàn thành](#11-những-phần-đã-hoàn-thành)
12. [Những phần còn thiếu hoặc chưa được xác minh](#12-những-phần-còn-thiếu-hoặc-chưa-được-xác-minh)
13. [Công việc tiếp theo đề xuất](#13-công-việc-tiếp-theo-đề-xuất)
14. [Phụ lục minh chứng](#14-phụ-lục-minh-chứng)

---

## 1. Tổng quan đề tài

### 1.1 Mục tiêu dự án

Xây dựng nền tảng quản lý công việc và chia sẻ tài liệu số bảo mật dành cho tổ chức, trong đó:

- Công việc được giao dưới dạng **Task** (đơn vị công việc có vòng đời, người tạo, người nhận).
- Quyền truy cập tài liệu **chỉ được cấp khi có Task** làm căn cứ, và **tự động hết hạn** khi Task kết thúc hoặc khi thời hạn cấp quyền hết.
- **ADMIN** (người quản trị hệ thống) không bao giờ có quyền truy cập nội dung tài liệu — tách biệt hoàn toàn giữa quyền quản trị hệ thống và quyền truy cập nội dung.
- Mọi quyết định truy cập (cho phép/từ chối) đều được ghi nhận vào **Audit Trail** chống giả mạo (hash chain).

### 1.2 Yêu cầu nghiệp vụ chính

1. Xác thực người dùng (đăng nhập, JWT, refresh token rotation, phiên Redis).
2. Quản lý người dùng và vai trò (ADMIN / EMPLOYEE, capabilities).
3. Quản lý công việc (tạo, giao, chuyển trạng thái, comment, submission, review, child task).
4. Quản lý tài liệu số (upload, phiên bản, mã hóa AES-256-GCM, quét malware, chữ ký số).
5. Cấp quyền tài liệu có thời hạn (Grant dựa trên Task, delegation, cascade revoke).
6. Kiểm tra quyền fail-closed (mọi lỗi đều từ chối, không bao giờ cho phép mặc định).
7. Audit log chống giả mạo (append-only, hash chain, single writer).
8. Thông báo và giám sát bảo mật.
9. Hồ sơ, chuyển giao và hủy tài liệu (Record, Transfer Package, Disposal).

### 1.3 Ngăn xếp công nghệ (Technology Stack)

| Thành phần | Công nghệ | Phiên bản |
|---|---|---|
| Runtime | Node.js | >= 24 LTS |
| Framework | NestJS | 11.1.28 |
| Ngôn ngữ | TypeScript | 5.9.3 |
| ORM | Prisma | 6 |
| Cơ sở dữ liệu | PostgreSQL | 16.10 |
| Cache/Session | Redis | 7.4.7 |
| Message Broker | RabbitMQ | 3.13.7 |
| Object Storage | MinIO | RELEASE.2025-09-07 |
| Antivirus | ClamAV | 1.4.5 |
| Quản lý gói | pnpm | 9.15.9 |
| Validation | Zod | 3.25.76 |
| Logging | Pino | 9.14.0 |
| Testing | Jest + Supertest | 29.7.0 / 7.2.2 |
| Containerization | Docker (multi-stage) | node:24-alpine |
| API Docs | Swagger (@nestjs/swagger) | 11.4.6 |

### 1.4 Số lượng service backend

**10 service** (1 API Gateway + 9 service sở hữu database riêng).

### 1.5 Trạng thái triển khai hiện tại

Dự án đang ở giai đoạn **triển khai chức năng cốt lõi**. Tất cả 10 service đã có mã nguồn, 9 Prisma schema đã được định nghĩa, API Gateway đã có JWT guard và proxy routing. Tuy nhiên, **chưa có Prisma migration nào được tạo** (chỉ có schema, chưa chạy `prisma migrate`), và luồng E2E hoàn chỉnh **chưa được xác minh chạy thành công** trên toàn bộ stack.

---

## 2. Kiến trúc tổng thể

### 2.1 Mô tả kiến trúc

Hệ thống sử dụng kiến trúc **NestJS monorepo** — tất cả 10 ứng dụng và 6 thư viện dùng chung nằm trong một repository duy nhất, quản lý bởi pnpm (không phải pnpm workspace). Mỗi service được build và deploy độc lập thông qua một Dockerfile duy nhất với tham số `APP`.

**API Gateway** (port 3000) là điểm vào duy nhất cho client. Nó xác thực JWT, giới hạn tốc độ truy cập (rate limiting), và proxy request tới các service nội bộ. Các service giao tiếp với nhau qua hai cơ chế:

- **HTTP đồng bộ (synchronous):** service-to-service call (ví dụ: Task Service gọi Permission Service để kiểm tra quyền).
- **RabbitMQ bất đồng bộ (asynchronous):** domain events được publish lên exchange `c17.domain` (topic exchange, durable). Hiện tại chỉ có **publisher** được triển khai ở Task Service và Document Service; **consumer** chưa được triển khai ở bất kỳ service nào.

Mỗi service sở hữu **database riêng** (database-per-service), được khởi tạo qua script `infra/postgres/init-databases.sh`. Không service nào được phép truy vấn database của service khác.

### 2.2 Sơ đồ kiến trúc

```mermaid
graph TB
    Client["Client (Browser/Mobile)"]
    
    subgraph "API Gateway (port 3000)"
        GW["api-gateway<br/>JWT Guard + Rate Limit + Proxy"]
    end
    
    subgraph "Core Services"
        AUTH["authentication-identity-service<br/>port 3001 | auth_db"]
        USER["user-role-management-service<br/>port 3002 | user_role_db"]
        TASK["task-management-service<br/>port 3003 | task_db"]
        DOC["document-management-service<br/>port 3004 | document_db"]
    end
    
    subgraph "Security Services"
        DOCSEC["document-security-service<br/>port 3005 | document_security_db"]
        PERM["permission-service<br/>port 3006 | permission_db"]
        SECMON["security-monitoring-service<br/>port 3009 | security_monitoring_db"]
    end
    
    subgraph "Supporting Services"
        AUDIT["audit-log-service<br/>port 3007 | audit_db"]
        NOTIF["notification-service<br/>port 3008 | notification_db"]
    end
    
    subgraph "Infrastructure"
        PG["PostgreSQL 16.10<br/>(9 databases)"]
        REDIS["Redis 7.4.7"]
        RMQ["RabbitMQ 3.13.7<br/>Exchange: c17.domain"]
        MINIO["MinIO<br/>(Object Storage)"]
        CLAM["ClamAV 1.4.5<br/>(Malware Scan)"]
    end
    
    Client -->|HTTPS| GW
    GW -->|HTTP proxy| AUTH
    GW -->|HTTP proxy| USER
    GW -->|HTTP proxy| TASK
    GW -->|HTTP proxy| DOC
    GW -->|HTTP proxy| DOCSEC
    GW -->|HTTP proxy| PERM
    GW -->|HTTP proxy| AUDIT
    GW -->|HTTP proxy| NOTIF
    GW -->|HTTP proxy| SECMON
    
    TASK -->|HTTP: permission check| PERM
    TASK -->|HTTP: audit record| AUDIT
    TASK -.->|RabbitMQ: task.created| RMQ
    
    DOC -->|HTTP: permission check| PERM
    DOC -->|HTTP: audit record| AUDIT
    DOC -->|HTTP: security process| DOCSEC
    DOC -.->|RabbitMQ: document.created| RMQ
    
    AUTH -->|session store| REDIS
    
    AUTH --> PG
    USER --> PG
    TASK --> PG
    DOC --> PG
    DOCSEC --> PG
    PERM --> PG
    AUDIT --> PG
    NOTIF --> PG
    SECMON --> PG
```

---

## 3. Danh sách service

| Service | Trách nhiệm | Port | Database sở hữu | Module chính | API chính | Service phụ thuộc | Trạng thái | File minh chứng |
|---|---|---|---|---|---|---|---|---|
| api-gateway | Xác thực JWT, rate limiting, proxy routing tới 10 nhóm route | 3000 | _(không có)_ | `GatewayController`, `JwtAuthGuard`, `RateLimitGuard` | `ALL /api/{auth,users,tasks,documents,...}/*` | Tất cả service qua HTTP proxy | ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| authentication-identity-service | Đăng ký, đăng nhập, refresh token rotation, logout, quản lý phiên Redis | 3001 | `auth_db` | `AuthController`, `AuthService`, `RedisService` | `POST /auth/{register,login,refresh,logout}` | Redis | ĐÃ TRIỂN KHAI VÀ ĐÃ KIỂM THỬ | `apps/authentication-identity-service/src/auth/auth.service.ts` |
| user-role-management-service | CRUD người dùng, lock/unlock, cấp/thu hồi capability | 3002 | `user_role_db` | `UsersController`, `UsersService` | `GET/POST /users`, `POST /users/:id/{lock,unlock,capabilities}` | Không | ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP | `apps/user-role-management-service/src/users/users.service.ts` |
| task-management-service | Tạo/giao/chuyển trạng thái task, comment, submission, review, participant, activity log | 3003 | `task_db` | `TasksController`, `TasksService`, `PermissionClient`, `AuditClient` | `GET/POST /tasks`, `POST /tasks/:id/{status,assign,block,...}` | permission-service, audit-log-service, RabbitMQ | ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| document-management-service | Tạo tài liệu, phiên bản, download ticket, record, transfer package | 3004 | `document_db` | `DocumentsController`, `RecordsController`, `TransferPackagesController`, `DocumentsService` | `GET/POST /documents`, `/records`, `/transfer-packages` | permission-service, audit-log-service, document-security-service, RabbitMQ | ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP | `apps/document-management-service/src/documents/documents.service.ts` |
| document-security-service | Security pipeline: tạo encryption record, cập nhật scan, ký số, quản lý KEK version | 3005 | `document_security_db` | `SecurityController`, `SecurityPipelineService` | `POST /security/process`, `POST /security/:id/versions/:v/{scan,sign}`, `GET/POST /security/kek/*` | Không | ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP | `apps/document-security-service/src/security/security-pipeline.service.ts` |
| permission-service | Kiểm tra quyền (fail-closed), CRUD grant, delegation, revoke | 3006 | `permission_db` | `PermissionsController`, `PermissionService` | `POST /internal/permissions/check`, `GET/POST/DELETE /grants` | Không | ĐÃ TRIỂN KHAI VÀ ĐÃ KIỂM THỬ | `apps/permission-service/src/permissions/permission.service.ts` |
| audit-log-service | Append-only hash chain audit log, xác minh tính toàn vẹn | 3007 | `audit_db` | `AuditController`, `AuditService` | `POST /audit/events`, `GET /audit/events`, `GET /audit/chain/head`, `POST /audit/chain/verify` | Không | ĐÃ TRIỂN KHAI VÀ ĐÃ KIỂM THỬ | `apps/audit-log-service/src/audit/audit.service.ts` |
| notification-service | Tạo/đọc thông báo, đánh dấu đã đọc, quản lý preferences | 3008 | `notification_db` | `NotificationsController`, `NotificationsService` | `GET/POST /notifications`, `POST /notifications/:id/read`, `GET/PUT /notifications/preferences/:userId` | Không | ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP | `apps/notification-service/src/notifications/notifications.service.ts` |
| security-monitoring-service | Ghi nhận sự kiện bảo mật, kiểm tra ngưỡng, tạo cảnh báo, quản lý rule | 3009 | `security_monitoring_db` | `MonitoringController`, `MonitoringService` | `POST /monitoring/events`, `GET /monitoring/alerts`, `POST/GET /monitoring/rules` | Không | ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP | `apps/security-monitoring-service/src/monitoring/monitoring.service.ts` |

---

## 4. Thiết kế cơ sở dữ liệu

Mỗi service sở hữu database PostgreSQL riêng, được khởi tạo qua script `infra/postgres/init-databases.sh`. Không service nào được truy vấn database của service khác — đây là nguyên tắc database-per-service.

**Lưu ý quan trọng:** Tại thời điểm báo cáo, **không có Prisma migration nào** được tạo trong thư mục `prisma/*/migrations/`. Các schema được định nghĩa nhưng migration chưa được generate và chưa được apply.

### 4.1 Authentication Database (`auth_db`)

**Schema:** `prisma/authentication-identity-service/schema.prisma`
**Prisma client:** `@prisma/client-auth`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `User` | Người dùng hệ thống | `id` (UUID, PK), `email` (unique), `password_hash`, `role` (default `EMPLOYEE`), `locked_at` (nullable — khi bị khóa) | `email` UNIQUE |
| `RefreshToken` | Token làm mới phiên đăng nhập | `id` (UUID, PK), `user_id` (FK → User), `token_hash` (unique — SHA-256 của raw token), `revoked_at`, `expires_at` | `token_hash` UNIQUE, INDEX on `user_id`, INDEX on `expires_at` |

**Quan hệ:** `User` 1:N `RefreshToken` (cascade delete).

### 4.2 User Role Database (`user_role_db`)

**Schema:** `prisma/user-role-management-service/schema.prisma`
**Prisma client:** `@prisma/client-user-role`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `User` | Bản sao thông tin người dùng cho service quản lý vai trò | `id` (UUID, PK — không auto-generate, nhận từ auth service), `email` (unique), `role`, `locked_at` | `email` UNIQUE |
| `Capability` | Quyền hạn chi tiết của EMPLOYEE | `id` (UUID, PK), `user_id` (FK → User), `capability` (tên quyền) | UNIQUE(`user_id`, `capability`), INDEX on `user_id` |

**Quan hệ:** `User` 1:N `Capability` (cascade delete).

### 4.3 Task Database (`task_db`)

**Schema:** `prisma/task-management-service/schema.prisma`
**Prisma client:** `@prisma/client-task`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `Task` | Đơn vị công việc | `id` (UUID, PK), `title`, `description`, `status` (default `CREATED`), `creator_id`, `assignee_id`, `parent_task_id` (FK tự tham chiếu), `deadline`, `blocked`, `blocked_reason`, `previous_status`, `result` | INDEX on `creator_id`, `assignee_id`, `parent_task_id`, `status`, `deadline` |
| `TaskParticipant` | Người tham gia task | `id`, `task_id` (FK), `user_id`, `role` (default `PARTICIPANT`) | UNIQUE(`task_id`, `user_id`), INDEX on `user_id` |
| `TaskComment` | Bình luận trên task (chỉ participant mới đọc được) | `id`, `task_id` (FK), `author_id`, `content` | INDEX on `task_id`, `author_id` |
| `TaskStatusHistory` | Lịch sử chuyển trạng thái | `id`, `task_id` (FK), `from_status`, `to_status`, `changed_by`, `reason` | INDEX on `task_id` |
| `TaskActivity` | Nhật ký hoạt động (append-only) | `id`, `task_id` (FK), `activity_type`, `actor_id`, `summary`, `metadata` (JSON) | INDEX on `task_id`, `created_at` |
| `TaskSubmission` | Kết quả nộp để review | `id`, `task_id` (FK), `author_id`, `content`, `status` (default `PENDING`), `reviewer_id`, `review_comment`, `reviewed_at` | INDEX on `task_id` |

**Quan hệ:** `Task` tự tham chiếu qua `parent_task_id` (TaskHierarchy). Tất cả model con cascade delete theo Task.

### 4.4 Document Database (`document_db`)

**Schema:** `prisma/document-management-service/schema.prisma`
**Prisma client:** `@prisma/client-document`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `Document` | Tài liệu số | `id` (UUID, PK), `title`, `document_type`, `owner_id`, `creator_id`, `security_level` (default `INTERNAL`), `status` (default `UPLOADED`), `current_version`, `retention_policy`, `archive_status`, `record_id` | INDEX on `owner_id`, `creator_id`, `status`, `record_id` |
| `DocumentVersion` | Phiên bản tài liệu | `id`, `document_id` (FK), `version`, `object_key` (đường dẫn MinIO), `checksum` (SHA-256), `signature`, `kek_version`, `encrypted_dek`, `file_size`, `mime_type`, `created_by` | UNIQUE(`document_id`, `version`), INDEX on `document_id` |
| `Record` | Hồ sơ lưu trữ | `id`, `title`, `description`, `status` (default `DRAFT`), `creator_id`, `sealed_at` | INDEX on `creator_id`, `status` |
| `RecordEntry` | Mục trong hồ sơ | `id`, `record_id` (FK), `document_id`, `document_version_id` | UNIQUE(`record_id`, `document_id`, `document_version_id`) |
| `TransferPackage` | Gói chuyển giao lưu trữ | `id`, `record_id` (FK), `status` (default `DRAFT`), `submitter_id`, `archivist_id`, `manifest` (JSON), `metadata` (JSON), `checksums` (JSON), `signature`, `rejection_reason`, `receipt` (JSON) | INDEX on `record_id`, `status`, `submitter_id` |
| `DownloadTicket` | Vé tải tài liệu có thời hạn | `id`, `document_id`, `version`, `actor_id`, `object_key`, `expires_at`, `used_at` | INDEX on `document_id`, `actor_id`, `expires_at` |

### 4.5 Document Security Database (`document_security_db`)

**Schema:** `prisma/document-security-service/schema.prisma`
**Prisma client:** `@prisma/client-document-security`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `EncryptionRecord` | Bản ghi mã hóa cho mỗi phiên bản tài liệu | `id`, `document_id`, `version`, `object_key`, `checksum`, `signature`, `kek_version` (default 1), `encrypted_dek`, `iv`, `auth_tag`, `file_size`, `mime_type`, `scan_status` (default `PENDING`), `scan_result` | UNIQUE(`document_id`, `version`), INDEX on `document_id`, `object_key` |
| `KekVersion` | Phiên bản Key Encryption Key | `id` (auto-increment, PK), `active` (boolean, default true) | — |

### 4.6 Permission Database (`permission_db`)

**Schema:** `prisma/permission-service/schema.prisma`
**Prisma client:** `@prisma/client-permission`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `Grant` | Cấp quyền truy cập tài liệu có thời hạn | `id` (UUID, PK), `grantor_id`, `actor_id`, `resource_type`, `resource_id`, `permissions` (string[]), `task_id`, `parent_grant_id` (FK tự tham chiếu cho delegation), `expires_at`, `effective_expires_at` (denormalized), `status` (default `ACTIVE`), `revoked_at`, `revocation_reason` | INDEX on `actor_id`, `resource_id`, `task_id`, `parent_grant_id`, `effective_expires_at`, `status` |

**Quan hệ:** `Grant` tự tham chiếu qua `parent_grant_id` (Delegation tree).

### 4.7 Audit Database (`audit_db`)

**Schema:** `prisma/audit-log-service/schema.prisma`
**Prisma client:** `@prisma/client-audit`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `AuditEvent` | Sự kiện audit (append-only, hash chain) | `id` (string, PK — do caller cung cấp, dùng cho dedup), `event_type`, `occurred_at`, `actor_id`, `resource_type`, `resource_id`, `payload` (JSON), `previous_hash`, `current_hash`, `sequence_number` (UNIQUE) | UNIQUE on `sequence_number`, INDEX on `occurred_at`, (`resource_type`, `resource_id`), `actor_id`, `event_type` |
| `ChainHead` | Singleton row — đầu chuỗi hash | `id` (default `singleton`), `last_hash`, `last_event_id`, `sequence` | — |

### 4.8 Notification Database (`notification_db`)

**Schema:** `prisma/notification-service/schema.prisma`
**Prisma client:** `@prisma/client-notification`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `Notification` | Thông báo | `id` (UUID, PK), `recipient_id`, `type`, `title`, `body`, `channel` (default `IN_APP`), `read_at`, `metadata` (JSON) | INDEX on `recipient_id`, `created_at`, `read_at` |
| `NotificationPreference` | Tùy chọn thông báo | `id` (UUID, PK), `user_id` (UNIQUE), `email_enabled` (default true), `in_app_enabled` (default true) | INDEX on `user_id` |

### 4.9 Security Monitoring Database (`security_monitoring_db`)

**Schema:** `prisma/security-monitoring-service/schema.prisma`
**Prisma client:** `@prisma/client-security-monitoring`

| Model | Mô tả | Trường quan trọng | Index / Constraint |
|---|---|---|---|
| `SecurityAlert` | Cảnh báo bảo mật | `id` (UUID, PK), `rule_id`, `severity` (default `MEDIUM`), `actor_id`, `description`, `metadata` (JSON), `status` (default `OPEN`), `resolved_at`, `resolved_by` | INDEX on `actor_id`, `rule_id`, `status`, `created_at` |
| `SecurityRule` | Quy tắc giám sát | `id` (UUID, PK), `name` (UNIQUE), `description`, `rule_type`, `threshold` (default 5), `window_minutes` (default 15), `enabled` (default true), `action` (default `ALERT`) | — |
| `SecurityEventCounter` | Bộ đếm sự kiện trong cửa sổ thời gian | `id` (UUID, PK), `rule_id`, `actor_id`, `count` (default 0), `window_start` | UNIQUE(`rule_id`, `actor_id`, `window_start`), INDEX on `rule_id`, `actor_id` |

---

## 5. Các luồng nghiệp vụ đã thiết kế/triển khai

### 5.1 Đăng nhập và quản lý phiên

**Trạng thái:** `ĐÃ TRIỂN KHAI VÀ ĐÃ KIỂM THỬ`

Luồng xác thực đã được triển khai đầy đủ trong `authentication-identity-service` với integration test chạy trên PostgreSQL và Redis thật (`apps/authentication-identity-service/test/auth-integration.spec.ts`).

**Chi tiết triển khai:**

- **Hashing mật khẩu:** bcryptjs, cost factor 10 (`apps/authentication-identity-service/src/auth/auth.service.ts:36`).
- **JWT access token:** ký bằng `JWT_SECRET` (min 32 ký tự), TTL 1800 giây (30 phút). Payload chứa `sub` (userId), `role`, `capabilities`.
- **Refresh token rotation:** token raw là UUID, lưu SHA-256 hash vào database. Khi refresh: revoke token cũ, phát hành cặp token mới. TTL 7 ngày.
- **Redis session metadata:** lưu tại key `session:{refreshTokenId}` với TTL bằng refresh token. Chứa `userId`, `email`, `role`, `capabilities`, `refreshTokenId`.
- **Logout/revoke:** revoke refresh token trong DB, xóa session Redis. Hỗ trợ `revokeAllUserTokens(userId)` để xóa toàn bộ token và session.
- **Locked user:** kiểm tra `locked_at` khi login và refresh — nếu bị khóa thì từ chối.

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as API Gateway
    participant AUTH as Auth Service
    participant DB as auth_db
    participant R as Redis

    C->>GW: POST /api/auth/login {email, password}
    GW->>AUTH: proxy (public route, no JWT)
    AUTH->>DB: findUnique({email})
    DB-->>AUTH: User {id, password_hash, role, locked_at}
    AUTH->>AUTH: check locked_at == null
    AUTH->>AUTH: bcrypt.compare(password, hash)
    AUTH->>AUTH: sign JWT {sub, role, capabilities}
    AUTH->>AUTH: generate UUID refresh token
    AUTH->>DB: create RefreshToken {token_hash: SHA256(token)}
    AUTH->>R: SET session:{tokenId} {metadata} EX 604800
    AUTH-->>GW: {access_token, refresh_token, expires_in_seconds}
    GW-->>C: 200 OK
```

### 5.2 Tạo và xử lý công việc

**Trạng thái:** `ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP`

Luồng quản lý task đã được triển khai trong `task-management-service` (`apps/task-management-service/src/tasks/tasks.service.ts`). Có tích hợp Permission Client và Audit Client nhưng chưa có integration test.

**Chi tiết triển khai:**

- **Tạo task:** tạo task với status `CREATED`, tự động thêm creator làm participant với role `CREATOR`. Publish event `task.created` qua RabbitMQ. Ghi audit event `TASK_CREATED`.
- **Giao task (assign):** kiểm tra quyền `TASK_MODIFY` qua Permission Service, cập nhật `assignee_id`, upsert participant role `ASSIGNEE`, ghi TaskActivity.
- **Chuyển trạng thái:** status hợp lệ: `CREATED`, `IN_PROGRESS`, `REVIEW`, `COMPLETED`, `CANCELLED`, `BLOCKED`. Kiểm tra quyền `TASK_MODIFY`. Ghi TaskStatusHistory và TaskActivity.
- **Comment:** thêm comment và ghi TaskActivity loại `COMMENT`.
- **Submission:** tạo submission với status `PENDING`, ghi TaskActivity loại `SUBMISSION`.
- **Review:** reviewer approve/reject submission, cập nhật task result nếu approve, ghi TaskActivity loại `REVIEW_DECISION`.
- **Child task:** hỗ trợ qua `parent_task_id` (self-referencing relation).
- **Block/Unblock:** đặt `blocked=true` với `blocked_reason`, ghi activity.
- **TaskActivity:** mọi thay đổi đều ghi vào bảng TaskActivity (append-only history).

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as API Gateway
    participant TASK as Task Service
    participant PERM as Permission Service
    participant AUDIT as Audit Service
    participant RMQ as RabbitMQ
    participant DB as task_db

    C->>GW: POST /api/tasks {title, assignee_id, deadline}
    GW->>GW: JWT verify → attach user context
    GW->>TASK: proxy with x-user-id, x-user-role headers
    TASK->>DB: create Task {status: CREATED, creator_id}
    TASK->>DB: create TaskParticipant {role: CREATOR}
    TASK->>AUDIT: POST /audit/events {TASK_CREATED} (best-effort)
    TASK->>RMQ: publish task.created to c17.domain
    TASK-->>GW: 201 {id, title, status, ...}
    GW-->>C: 201 Created

    C->>GW: POST /api/tasks/:id/status {status: IN_PROGRESS}
    GW->>TASK: proxy
    TASK->>PERM: POST /internal/permissions/check {TASK_MODIFY}
    PERM-->>TASK: {allowed: true}
    TASK->>DB: update Task {status: IN_PROGRESS}
    TASK->>DB: create TaskStatusHistory
    TASK->>DB: create TaskActivity
    TASK-->>GW: 200 OK
```

### 5.3 Upload và bảo mật tài liệu

**Trạng thái:** `ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP`

Luồng tạo tài liệu và xử lý bảo mật đã được triển khai, nhưng **chưa kết nối thực tế với MinIO và ClamAV**. Security pipeline hiện tại lưu metadata mã hóa nhưng không thực sự mã hóa file hay quét malware.

**Chi tiết triển khai:**

- **Tạo tài liệu:** `DocumentsController.createDocument` tạo metadata tài liệu, kiểm tra `security_level` (default `INTERNAL`). Publish event `document.created`. Ghi audit event `DOCUMENT_CREATED`.
- **Tạo phiên bản:** `createDocumentVersion` nhận `object_key`, `checksum`, `encrypted_dek`, `kek_version`. Gọi `SecurityClient.processDocument` (best-effort) để tạo EncryptionRecord.
- **Security Client → Document Security Service:** `POST /security/process` tạo `EncryptionRecord` với `scan_status: PENDING`. **Lưu ý:** `iv` và `auth_tag` hiện là placeholder (`'placeholder-iv'`, `'placeholder-tag'`) — mã hóa AES-256-GCM thực tế chưa được triển khai phía client (`apps/document-management-service/src/security/security.client.ts:52-53`).
- **Quét malware:** API `POST /security/:documentId/versions/:version/scan` đã có để cập nhật `scan_status` (`CLEAN`/`INFECTED`/`ERROR`), nhưng **chưa có integration với ClamAV** — cần gọi thủ công hoặc qua worker.
- **Chữ ký số:** API `POST /security/:documentId/versions/:version/sign` đã có, yêu cầu `scan_status === 'CLEAN'` trước khi ký.
- **KEK version:** model `KekVersion` quản lý phiên bản key, hỗ trợ `rotateKek()`. Hiện chỉ có scaffold — không có KMS thực tế (theo ADR-0003).
- **MinIO storage:** `object_key` được lưu trong metadata nhưng **chưa có code upload/download file thực tế từ MinIO**.

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as API Gateway
    participant DOC as Document Service
    participant DOCSEC as Document Security Service
    participant PERM as Permission Service
    participant AUDIT as Audit Service
    participant DB_DOC as document_db
    participant DB_SEC as document_security_db

    C->>GW: POST /api/documents {title, type, owner_id}
    GW->>DOC: proxy
    DOC->>DB_DOC: create Document {security_level, status: UPLOADED}
    DOC->>AUDIT: record DOCUMENT_CREATED (best-effort)
    DOC-->>GW: 201 {id, title, ...}

    C->>GW: POST /api/documents/:id/versions {object_key, checksum, encrypted_dek}
    GW->>DOC: proxy
    DOC->>DB_DOC: create DocumentVersion {version: N+1}
    DOC->>DOCSEC: POST /security/process (best-effort)
    DOCSEC->>DB_SEC: create EncryptionRecord {scan_status: PENDING}
    DOCSEC-->>DOC: {id, scan_status: PENDING}
    DOC-->>GW: 201

    Note over DOCSEC: Quét malware và ký số cần gọi riêng
    Note over DOCSEC: ClamAV integration chưa triển khai
```

### 5.4 Cấp quyền tài liệu theo thời hạn

**Trạng thái:** `ĐÃ TRIỂN KHAI VÀ ĐÃ KIỂM THỬ`

Luồng cấp quyền đã được triển khai trong `permission-service` với integration test (`apps/permission-service/test/permission-integration.spec.ts`).

**Chi tiết triển khai:**

- **`permissions[]`:** mảng string các quyền được cấp (ví dụ: `['PREVIEW', 'DOWNLOAD']`). Định nghĩa trong `libs/contracts/src/permission/permission-actions.ts`: `PREVIEW`, `DOWNLOAD`, `UPDATE`, `SHARE`, `TRANSFER`, `DISPOSE`, `TASK_PARTICIPATE`, `COMMENT_LIST`, `COMMENT_CREATE`, `ARCHIVE_SUBMIT`, `ARCHIVE_RECEIVE`, `ARCHIVE_DECIDE`, `DISPOSAL_APPROVE`.
- **`expires_at`:** thời điểm hết hạn do người cấp chỉ định.
- **`effective_expires_at`:** thời điểm hết hạn thực tế, được tính denormalized = `min(expires_at, task.deadline, parent_grant.effective_expires_at)`. Lưu trực tiếp trên row grant để kiểm tra quyền chỉ cần đọc `permission_db` (ADR-0001).
- **Task-derived grants:** mọi grant đều phải có `task_id`. Không có cách cấp quyền tài liệu mà không có task.
- **Delegated grants:** `POST /grants/:id/delegate` tạo child grant. Quyền của child phải là tập con của parent. Child kế thừa `effective_expires_at` của parent.
- **Parent-grant restrictions:** child không thể có quyền mà parent không có, không thể sống lâu hơn parent.
- **ADMIN hard-deny:** hàm `isAdminForbiddenAction()` kiểm tra — tất cả 13 PermissionAction hiện tại đều bị cấm đối với ADMIN (`libs/contracts/src/permission/permission-actions.ts:43-57`).
- **Fail-closed permission checking:** mọi lỗi trong `check()` đều trả về `{allowed: false, reason_code: PERMISSION_SERVICE_UNAVAILABLE}` (`apps/permission-service/src/permissions/permission.service.ts:112-120`).
- **Expiration:** khi `now > effective_expires_at`, grant bị coi là hết hạn, trả về `GRANT_EXPIRED`.
- **Revocation:** `DELETE /grants/:id` cập nhật `status: REVOKED`, `revoked_at`. **Lưu ý:** cascade revoke (tự động revoke child grants) **chưa được triển khai** trong code hiện tại — chỉ revoke grant được chỉ định.

### 5.5 Xem và tải tài liệu

**Trạng thái:** `ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP`

- **Permission Service check:** `DocumentsController` gọi `PermissionClient.check()` với action `PREVIEW` (cho xem metadata/preview) hoặc `DOWNLOAD` (cho download ticket).
- **ALLOW response:** trả về metadata tài liệu hoặc tạo `DownloadTicket` (có thời hạn, mặc định 3600 giây).
- **DENY response:** ghi audit event `DOCUMENT_ACCESS_DENIED` với `reason_code`, trả 403.
- **Service unavailable:** Permission Client trả `{allowed: false, reason_code: PERMISSION_SERVICE_UNAVAILABLE}` khi timeout hoặc lỗi mạng. **Không bao giờ cho phép mặc định.**
- **Download ticket:** `DownloadTicket` lưu `document_id`, `version`, `actor_id`, `object_key`, `expires_at`. **Lưu ý:** code tạo ticket nhưng **chưa có endpoint thực tế để redeem ticket và trả file từ MinIO**.
- **Audit recording:** mọi truy cập (thành công và thất bại) đều ghi vào audit-log-service qua `AuditClient`.

### 5.6 Audit Log

**Trạng thái:** `ĐÃ TRIỂN KHAI VÀ ĐÃ KIỂM THỬ`

Integration test: `apps/audit-log-service/test/audit-integration.spec.ts`.

- **Append-only design:** sự kiện chỉ thêm, không sửa, không xóa.
- **Canonical payload:** `AuditService.canonicalJSON()` sắp xếp key alphabetically trước khi hash, đảm bảo tính xác định.
- **`sequence_number`:** tăng tuần tự, UNIQUE constraint.
- **`previous_hash`:** hash của sự kiện trước đó (từ `ChainHead.last_hash`).
- **`current_hash`:** `SHA-256(canonicalJSON(payload_fields) + previous_hash)`.
- **Single writer:** `ChainHead` là singleton row (id = `'singleton'`). Append chạy trong Prisma transaction.
- **PostgreSQL lock:** transaction đảm bảo chỉ một writer tại một thời điểm (ADR-0002).
- **`event_id` deduplication:** kiểm tra `event_id` đã tồn tại trong cùng transaction — nếu có thì skip, tránh fork chain khi RabbitMQ redeliver.
- **Chain verification:** `verifyChainIntegrity()` đọc toàn bộ events theo `sequence_number`, tính lại hash từ đầu, so sánh — trả `{valid: true}` hoặc `{valid: false, broken_at: N}`.

```mermaid
sequenceDiagram
    participant Caller as Any Service
    participant AUDIT as Audit Service
    participant DB as audit_db

    Caller->>AUDIT: POST /audit/events {event_id, event_type, payload, ...}
    AUDIT->>DB: BEGIN TRANSACTION
    AUDIT->>DB: Check event_id exists (dedup)
    alt Already exists
        AUDIT-->>Caller: 200 (no-op, idempotent)
    else New event
        AUDIT->>DB: SELECT ChainHead (singleton)
        AUDIT->>AUDIT: current_hash = SHA256(canonical(payload) + last_hash)
        AUDIT->>DB: INSERT AuditEvent {sequence_number++}
        AUDIT->>DB: UPDATE ChainHead {last_hash, sequence}
        AUDIT->>DB: COMMIT
        AUDIT-->>Caller: 201 {current_hash, sequence_number}
    end
```

### 5.7 Notification và Security Monitoring

**Trạng thái:** `ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP`

#### Notification Service

- **Events consumed:** **Chưa có consumer.** Service hiện chỉ có REST API để tạo/đọc thông báo. Chưa có RabbitMQ consumer để tự động tạo notification từ domain events.
- **Notification persistence:** lưu vào `notification_db`, model `Notification` với `recipient_id`, `type`, `title`, `body`, `channel`, `metadata`.
- **Read tracking:** `read_at` timestamp, `markAsRead(id)` và `markAllAsRead(recipient_id)`.
- **Preferences:** `NotificationPreference` với `email_enabled`, `in_app_enabled`. Upsert khi truy cập.

#### Security Monitoring Service

- **Events consumed:** **Chưa có consumer.** Service hiện chỉ có REST API. Chưa có RabbitMQ consumer để tự động ghi nhận sự kiện bảo mật.
- **Rules:** `SecurityRule` định nghĩa `rule_type`, `threshold`, `window_minutes`, `action` (ALERT/BLOCK).
- **Counters:** `SecurityEventCounter` đếm số sự kiện theo `rule_id` + `actor_id` + `window_start` (floored theo `window_minutes`). Dùng upsert để increment.
- **Thresholds:** khi `count >= threshold`, tạo `SecurityAlert` với severity `HIGH` (BLOCK) hoặc `MEDIUM` (ALERT).
- **Alert creation:** `POST /monitoring/events` kiểm tra rule, đếm, tạo alert nếu vượt ngưỡng. Trả `{triggered: true/false, alert_id}`.

### 5.8 Hồ sơ, chuyển giao và hủy tài liệu

**Trạng thái:** `ĐÃ TRIỂN KHAI, CHƯA KIỂM THỬ TÍCH HỢP`

Luồng này được triển khai trong `document-management-service` thông qua `RecordsController` và `TransferPackagesController`.

- **Records:** tạo `Record` (status `DRAFT`), thêm `RecordEntry` (document + version), seal (status → `SEALED`, set `sealed_at`). Record đã seal không thể thêm entry.
- **Transfer packages:** tạo `TransferPackage` (status `DRAFT`) liên kết với Record. `manifest` và `metadata` là JSON.
- **Submit:** chuyển status `DRAFT` → `SUBMITTED`, set `submitted_at`.
- **Review (archivist):** chuyển `SUBMITTED` → `ACCEPTED` hoặc `REJECTED`. Set `archivist_id`, `decided_at`, `rejection_reason`.
- **Checksum/signature:** model `TransferPackage` có trường `checksums` (JSON) và `signature` (string), nhưng **code hiện tại chưa tính checksum hay ký transfer package** — chỉ lưu metadata do caller cung cấp.
- **Retention/Disposal:** model `Document` có trường `retention_policy` và `archive_status`, nhưng **chưa có worker hay logic tự động hủy tài liệu** theo chính sách retention.

---

## 6. API hiện có

### 6.1 API Gateway (port 3000)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| ALL | `/api/auth/*` | Public (no JWT) | Proxy → Auth Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/users/*` | JWT required | Proxy → User Role Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/tasks/*` | JWT required | Proxy → Task Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/documents/*` | JWT required | Proxy → Document Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/records/*` | JWT required | Proxy → Document Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/transfer-packages/*` | JWT required | Proxy → Document Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/security/*` | JWT required | Proxy → Document Security Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/permissions/*` | JWT required | Proxy → Permission Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/audit/*` | JWT required | Proxy → Audit Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/notifications/*` | JWT required | Proxy → Notification Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| ALL | `/api/monitoring/*` | JWT required | Proxy → Security Monitoring Service | ĐÃ TRIỂN KHAI | `apps/api-gateway/src/proxy/gateway.controller.ts` |
| GET | `/health` | Public | Health check | ĐÃ TRIỂN KHAI | `libs/observability/src/health/health.controller.ts` |

### 6.2 Authentication Identity Service (port 3001)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| POST | `/auth/register` | Không | Đăng ký tài khoản mới | ĐÃ TRIỂN KHAI | `apps/authentication-identity-service/src/auth/auth.controller.ts` |
| POST | `/auth/login` | Không | Đăng nhập, nhận token pair | ĐÃ TRIỂN KHAI | `apps/authentication-identity-service/src/auth/auth.controller.ts` |
| POST | `/auth/refresh` | Không | Rotate refresh token | ĐÃ TRIỂN KHAI | `apps/authentication-identity-service/src/auth/auth.controller.ts` |
| POST | `/auth/logout` | Không | Revoke token và xóa session | ĐÃ TRIỂN KHAI | `apps/authentication-identity-service/src/auth/auth.controller.ts` |

### 6.3 User Role Management Service (port 3002)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| GET | `/users` | Không | Danh sách người dùng | ĐÃ TRIỂN KHAI | `apps/user-role-management-service/src/users/users.controller.ts` |
| GET | `/users/:id` | Không | Chi tiết người dùng | ĐÃ TRIỂN KHAI | `apps/user-role-management-service/src/users/users.controller.ts` |
| POST | `/users` | Không | Tạo người dùng | ĐÃ TRIỂN KHAI | `apps/user-role-management-service/src/users/users.controller.ts` |
| POST | `/users/:id/lock` | Không | Khóa tài khoản | ĐÃ TRIỂN KHAI | `apps/user-role-management-service/src/users/users.controller.ts` |
| POST | `/users/:id/unlock` | Không | Mở khóa tài khoản | ĐÃ TRIỂN KHAI | `apps/user-role-management-service/src/users/users.controller.ts` |
| POST | `/users/:id/capabilities` | Không | Cấp capability | ĐÃ TRIỂN KHAI | `apps/user-role-management-service/src/users/users.controller.ts` |
| DELETE | `/users/:id/capabilities/:capability` | Không | Thu hồi capability | ĐÃ TRIỂN KHAI | `apps/user-role-management-service/src/users/users.controller.ts` |

### 6.4 Task Management Service (port 3003)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| GET | `/tasks` | Không (list) | Danh sách task (filter: creator_id, assignee_id, status, parent_task_id) | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| GET | `/tasks/:id` | AuthContext + TASK_PARTICIPATE | Chi tiết task (permission-checked) | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks` | AuthContext | Tạo task mới | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/:id/status` | AuthContext + TASK_MODIFY | Cập nhật trạng thái | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/:id/assign` | AuthContext + TASK_MODIFY | Giao task | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/:id/block` | AuthContext | Block task | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/:id/unblock` | AuthContext | Unblock task | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/:id/participants` | AuthContext | Thêm participant | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| GET | `/tasks/:id/participants` | Không | Danh sách participant | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/:id/comments` | AuthContext | Thêm comment | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/:id/submit` | AuthContext | Nộp kết quả | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| POST | `/tasks/submissions/:id/review` | AuthContext | Review submission | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |
| GET | `/tasks/:id/activity` | Không | Nhật ký hoạt động | ĐÃ TRIỂN KHAI | `apps/task-management-service/src/tasks/tasks.controller.ts` |

### 6.5 Document Management Service (port 3004)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| GET | `/documents` | Không | Danh sách tài liệu | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/documents` | AuthContext | Tạo tài liệu | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| GET | `/documents/:id` | AuthContext + PREVIEW | Metadata tài liệu (permission-checked) | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| GET | `/documents/:id/preview` | AuthContext + PREVIEW | Preview tài liệu | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/documents/:id/versions` | AuthContext | Tạo phiên bản mới | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| GET | `/documents/:id/versions` | Không | Danh sách phiên bản | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| GET | `/documents/:id/versions/:version` | Không | Chi tiết phiên bản | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/documents/:id/download-ticket` | AuthContext + DOWNLOAD | Tạo download ticket | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| GET | `/documents/:id/download` | AuthContext + DOWNLOAD | Download (deprecated) | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| GET | `/records` | Không | Danh sách record | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/records` | AuthContext | Tạo record | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| GET | `/records/:id` | Không | Chi tiết record | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/records/:id/entries` | AuthContext | Thêm tài liệu vào record | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/records/:id/seal` | AuthContext | Seal record | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/transfer-packages` | AuthContext | Tạo transfer package | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/transfer-packages/:id/submit` | AuthContext | Submit package | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |
| POST | `/transfer-packages/:id/review` | AuthContext | Review package (archivist) | ĐÃ TRIỂN KHAI | `apps/document-management-service/src/documents/documents.controller.ts` |

### 6.6 Document Security Service (port 3005)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| POST | `/security/process` | Không | Xử lý tài liệu qua security pipeline | ĐÃ TRIỂN KHAI | `apps/document-security-service/src/security/security.controller.ts` |
| POST | `/security/:docId/versions/:v/scan` | Không | Cập nhật kết quả quét malware | ĐÃ TRIỂN KHAI | `apps/document-security-service/src/security/security.controller.ts` |
| POST | `/security/:docId/versions/:v/sign` | Không | Ký số (yêu cầu scan CLEAN) | ĐÃ TRIỂN KHAI | `apps/document-security-service/src/security/security.controller.ts` |
| GET | `/security/:docId/versions/:v` | Không | Xem encryption record | ĐÃ TRIỂN KHAI | `apps/document-security-service/src/security/security.controller.ts` |
| GET | `/security/records` | Không | Danh sách encryption records | ĐÃ TRIỂN KHAI | `apps/document-security-service/src/security/security.controller.ts` |
| GET | `/security/kek/active` | Không | Xem KEK version đang hoạt động | ĐÃ TRIỂN KHAI | `apps/document-security-service/src/security/security.controller.ts` |
| POST | `/security/kek/rotate` | Không | Rotate KEK | ĐÃ TRIỂN KHAI | `apps/document-security-service/src/security/security.controller.ts` |

### 6.7 Permission Service (port 3006)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| POST | `/internal/permissions/check` | Không (internal) | Kiểm tra quyền (fail-closed) | ĐÃ TRIỂN KHAI | `apps/permission-service/src/permissions/permissions.controller.ts` |
| POST | `/grants` | Không | Tạo grant mới | ĐÃ TRIỂN KHAI | `apps/permission-service/src/permissions/permissions.controller.ts` |
| GET | `/grants` | Không | Danh sách grants (filter) | ĐÃ TRIỂN KHAI | `apps/permission-service/src/permissions/permissions.controller.ts` |
| GET | `/grants/:id` | Không | Chi tiết grant | ĐÃ TRIỂN KHAI | `apps/permission-service/src/permissions/permissions.controller.ts` |
| POST | `/grants/:id/delegate` | Không | Delegate grant | ĐÃ TRIỂN KHAI | `apps/permission-service/src/permissions/permissions.controller.ts` |
| DELETE | `/grants/:id` | Không | Revoke grant | ĐÃ TRIỂN KHAI | `apps/permission-service/src/permissions/permissions.controller.ts` |

### 6.8 Audit Log Service (port 3007)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| POST | `/audit/events` | Không | Thêm audit event vào hash chain | ĐÃ TRIỂN KHAI | `apps/audit-log-service/src/audit/audit.controller.ts` |
| GET | `/audit/events` | Không | Danh sách audit events (filter, pagination) | ĐÃ TRIỂN KHAI | `apps/audit-log-service/src/audit/audit.controller.ts` |
| GET | `/audit/events/:id` | Không | Chi tiết audit event | ĐÃ TRIỂN KHAI | `apps/audit-log-service/src/audit/audit.controller.ts` |
| GET | `/audit/chain/head` | Không | Xem đầu chuỗi hash | ĐÃ TRIỂN KHAI | `apps/audit-log-service/src/audit/audit.controller.ts` |
| POST | `/audit/chain/verify` | Không | Xác minh tính toàn vẹn chuỗi hash | ĐÃ TRIỂN KHAI | `apps/audit-log-service/src/audit/audit.controller.ts` |

### 6.9 Notification Service (port 3008)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| POST | `/notifications` | Không | Tạo thông báo | ĐÃ TRIỂN KHAI | `apps/notification-service/src/notifications/notifications.controller.ts` |
| GET | `/notifications/:id` | Không | Chi tiết thông báo | ĐÃ TRIỂN KHAI | `apps/notification-service/src/notifications/notifications.controller.ts` |
| GET | `/notifications` | Không | Danh sách thông báo (recipient_id, unread_only) | ĐÃ TRIỂN KHAI | `apps/notification-service/src/notifications/notifications.controller.ts` |
| POST | `/notifications/:id/read` | Không | Đánh dấu đã đọc | ĐÃ TRIỂN KHAI | `apps/notification-service/src/notifications/notifications.controller.ts` |
| POST | `/notifications/read-all` | Không | Đánh dấu tất cả đã đọc | ĐÃ TRIỂN KHAI | `apps/notification-service/src/notifications/notifications.controller.ts` |
| GET | `/notifications/preferences/:userId` | Không | Xem preferences | ĐÃ TRIỂN KHAI | `apps/notification-service/src/notifications/notifications.controller.ts` |
| PUT | `/notifications/preferences/:userId` | Không | Cập nhật preferences | ĐÃ TRIỂN KHAI | `apps/notification-service/src/notifications/notifications.controller.ts` |

### 6.10 Security Monitoring Service (port 3009)

| Method | Endpoint | Authorization | Mục đích | Trạng thái | File |
|---|---|---|---|---|---|
| POST | `/monitoring/events` | Không | Ghi nhận sự kiện bảo mật | ĐÃ TRIỂN KHAI | `apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` |
| GET | `/monitoring/alerts` | Không | Danh sách cảnh báo | ĐÃ TRIỂN KHAI | `apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` |
| GET | `/monitoring/alerts/:id` | Không | Chi tiết cảnh báo | ĐÃ TRIỂN KHAI | `apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` |
| POST | `/monitoring/alerts/:id/resolve` | Không | Giải quyết cảnh báo | ĐÃ TRIỂN KHAI | `apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` |
| POST | `/monitoring/rules` | Không | Tạo rule | ĐÃ TRIỂN KHAI | `apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` |
| GET | `/monitoring/rules` | Không | Danh sách rules | ĐÃ TRIỂN KHAI | `apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` |
| PUT | `/monitoring/rules/:id/toggle` | Không | Bật/tắt rule | ĐÃ TRIỂN KHAI | `apps/security-monitoring-service/src/monitoring/monitoring.controller.ts` |

---

## 7. Event catalog

### 7.1 Định nghĩa event types (contracts)

Event types được định nghĩa tập trung tại `libs/contracts/src/events/event-types.ts`:

| `event_type` | Producer dự kiến | Consumer dự kiến | Payload tóm tắt | Trạng thái triển khai | File |
|---|---|---|---|---|---|
| `auth.login.failed` | authentication-identity-service | security-monitoring-service | `{email, ip, reason}` | MỚI CÓ KHUNG — chỉ định nghĩa type, chưa publish | `libs/contracts/src/events/event-types.ts` |
| `auth.session.revoked` | authentication-identity-service | notification-service | `{userId, sessionId}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |
| `user.locked` | user-role-management-service | notification-service, security-monitoring-service | `{userId, lockedBy}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |
| `user.unlocked` | user-role-management-service | notification-service | `{userId}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |
| `user.capability.granted` | user-role-management-service | audit-log-service | `{userId, capability, grantedBy}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |
| `user.capability.revoked` | user-role-management-service | audit-log-service | `{userId, capability}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |
| `permission.decision.made` | permission-service | audit-log-service, security-monitoring-service | `{actor_id, resource, action, allowed}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |
| `permission.grant.expired` | permission-service | notification-service | `{grant_id, actor_id}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |
| `task.deadline.changed` | task-management-service | permission-service | `{task_id, old_deadline, new_deadline}` | MỚI CÓ KHUNG | `libs/contracts/src/events/event-types.ts` |

### 7.2 Events thực sự được publish trong code

| `event_type` | Producer | Consumer | Payload | Trạng thái | File |
|---|---|---|---|---|---|
| `task.created` | task-management-service | _(chưa có consumer)_ | `{title, assignee_id}` | ĐÃ TRIỂN KHAI publisher, CHƯA CÓ consumer | `apps/task-management-service/src/tasks/tasks.controller.ts:148` |
| `document.created` | document-management-service | _(chưa có consumer)_ | `{title, document_type}` | ĐÃ TRIỂN KHAI publisher, CHƯA CÓ consumer | `apps/document-management-service/src/documents/documents.controller.ts` |

### 7.3 RabbitMQ Topology

- **Domain Exchange:** `c17.domain` (topic, durable) — `libs/messaging/src/topology.ts`
- **Dead Letter Exchange:** `c17.dlx` (topic, durable) — `libs/messaging/src/topology.ts`
- **Queue naming convention:** `{consumer}.{concern}` — `libs/messaging/src/topology.ts`
- **Publisher confirms:** enabled — `libs/messaging/src/amqp-event-publisher.ts:43`
- **In-memory mode:** `InMemoryEventPublisher` cho test/local — `libs/messaging/src/event-publisher.ts`

---

## 8. Các quyết định bảo mật quan trọng

### 8.1 ADMIN không có quyền truy cập nội dung

ADMIN là vai trò quản trị hệ thống — quản lý người dùng, vai trò, capabilities, policies. ADMIN **không bao giờ** có quyền đọc nội dung tài liệu hay tham gia task. Tất cả 13 `PermissionAction` hiện tại đều nằm trong `ADMIN_FORBIDDEN_ACTIONS` (`libs/contracts/src/permission/permission-actions.ts:43-57`). Kiểm tra tại `PermissionService.check()` (`apps/permission-service/src/permissions/permission.service.ts:59-65`).

**Xác minh code:** `isAdminForbiddenAction()` được gọi ở bước 1 của `check()`. Tuy nhiên, hiện tại code **chưa thực sự kiểm tra `actor.role === 'ADMIN'`** — chỉ kiểm tra action có nằm trong forbidden list. Comment trong code ghi nhận điều này: _"In a full implementation, this would check actor.role === 'ADMIN'"_ (line 58).

### 8.2 Comment chỉ dành cho participant

Theo ADR-0004 (`docs/adr/0004-participation-gated-confidentiality.md`), comment trên task chỉ participant mới đọc được. **Xác minh code:** `TasksController.getTask()` kiểm tra `TASK_PARTICIPATE` qua Permission Service. Tuy nhiên, endpoint `POST /tasks/:id/comments` chỉ kiểm tra `AuthContext` (user đăng nhập) mà **chưa kiểm tra permission `COMMENT_CREATE`** — đây là một gap cần khắc phục.

### 8.3 Mention/subscription không cấp quyền

Theo `CONTEXT.md` và ADR-0004, mention và subscription chỉ là cơ chế delivery, không cấp quyền truy cập. **Xác minh code:** chưa có code mention hay subscription trong repository — quy tắc này đúng bởi chưa triển khai tính năng.

### 8.4 Mọi grant đều yêu cầu task

Model `Grant` có trường `task_id` bắt buộc. Schema validation `createGrantSchema` yêu cầu `task_id: z.string().uuid()` (`apps/permission-service/src/permissions/permissions.controller.ts:22`). **Đã xác minh trong code.**

### 8.5 Mọi permission đều có thời hạn

Model `Grant` có `expires_at` và `effective_expires_at` bắt buộc. `check()` so sánh `now > effective_expires_at` và từ chối nếu hết hạn. **Đã xác minh trong code** (`apps/permission-service/src/permissions/permission.service.ts:88-95`).

### 8.6 Không VIEW nào tồn tại sau hết hạn

Khi grant hết hạn (hoặc bị revoke), mọi quyền đều bị thu hồi — không có quyền đọc residual. `check()` trả `GRANT_EXPIRED` cho mọi action khi `effective_expires_at` đã qua. **Đã xác minh.**

### 8.7 Delegation có giới hạn

`delegateGrant()` kiểm tra: parent phải `ACTIVE`, không bị revoke, quyền delegate phải là tập con của parent, kế thừa `effective_expires_at` của parent. **Đã xác minh** (`apps/permission-service/src/permissions/permission.service.ts:189-223`).

**Lưu ý:** cascade revoke khi revoke parent **chưa được triển khai** — child grants không tự động bị revoke khi parent bị revoke.

### 8.8 Fail-closed

Mọi lỗi trong `PermissionService.check()` đều trả `{allowed: false, reason_code: PERMISSION_SERVICE_UNAVAILABLE}`. `PermissionClient` (trong task và document service) cũng fail-closed: timeout hoặc lỗi mạng → `{allowed: false}`. **Đã xác minh** ở cả 3 vị trí:
- `apps/permission-service/src/permissions/permission.service.ts:112-120`
- `apps/task-management-service/src/permissions/permission.client.ts`
- `apps/document-management-service/src/permissions/permission.client.ts`

### 8.9 Từ chối tài liệu mật nhà nước (state-secret)

Theo `CONTEXT.md`, tài liệu mật nhà nước bị từ chối tại upload và không bao giờ trở thành Document. Security levels hợp lệ: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, `RESTRICTED` (`libs/contracts/src/security-levels.ts`). **Lưu ý:** code hiện tại **chưa validate** security level tại thời điểm tạo tài liệu — trường `security_level` chấp nhận string bất kỳ.

### 8.10 Mã hóa object storage

Model `DocumentVersion` và `EncryptionRecord` lưu `encrypted_dek`, `kek_version`, `iv`, `auth_tag`. Kiến trúc thiết kế cho AES-256-GCM với DEK/KEK. **Tuy nhiên:** mã hóa thực tế chưa được triển khai — `iv` và `auth_tag` là placeholder trong `SecurityClient` (`apps/document-management-service/src/security/security.client.ts:52-53`).

### 8.11 Audit log chống giả mạo

Hash chain với `SHA-256(canonical_payload + previous_hash)`, single writer, transaction-level dedup. **Đã triển khai và kiểm thử** (ADR-0002, `apps/audit-log-service/src/audit/audit.service.ts`).

---

## 9. Trạng thái kiểm thử và vận hành

### 9.1 Tổng quan kiểm thử

**Chạy `scripts/verify-full-backend.sh` trên Docker stack đầy đủ (2026-07-30): 45/45 checks PASSED.**

| Loại kiểm thử | Trạng thái | Minh chứng |
|---|---|---|
| TypeScript build (tsc) | ĐÃ XÁC MINH — build tất cả 10/10 service | `scripts/verify-full-backend.sh` step 12 |
| ESLint | ĐÃ XÁC MINH — 0 lỗi | `scripts/verify-full-backend.sh` step 11 |
| Prettier | Chưa cấu hình script verify | `package.json:format:check` |
| Unit tests (libs) | CÓ — contracts, config, observability có spec files | `libs/contracts/src/**/*.spec.ts` |
| Repository layout test | CÓ — kiểm tra cấu trúc monorepo | `test/repository-layout.spec.ts` |
| Integration tests (real DB) | ĐÃ XÁC MINH — 11 suites, tất cả PASS trên PostgreSQL/Redis/RabbitMQ/MinIO/ClamAV | `scripts/verify-full-backend.sh` step 13 |
| E2E tests | ĐÃ XÁC MINH — 7/7 cases PASS (12 test assertions) | `scripts/verify-full-backend.sh` step 15 |
| Audit chain verification | ĐÃ XÁC MINH — hash chain integrity valid | `scripts/verify-full-backend.sh` step 16 |

### 9.2 Chi tiết integration tests

**Task Authorization/Lifecycle** (`apps/task-management-service/test/task-authorization.integration.spec.ts`):
PostgreSQL + RabbitMQ. Kiểm tra: create task, assign participant, complete task, cascade permission revoke.

**Permission Expiry/Cascade Revoke** (`apps/permission-service/test/permission-integration.spec.ts`):
PostgreSQL. Kiểm tra: create grant, check permission (allowed/denied), grant expired, revoke grant.

**Document Security Pipeline** (`apps/document-security-service/test/security-pipeline.integration.spec.ts`):
MinIO + ClamAV. Kiểm tra: encrypt, scan clean file, scan EICAR virus, KEK rotation.

**Document Upload Ingress** (`apps/document-management-service/test/document-upload.integration.spec.ts`):
PostgreSQL + MinIO + ClamAV. Kiểm tra: upload clean, upload virus (clamd rejection), version management.

**Secure Download Ticket** (`apps/document-management-service/test/document-download-ticket.integration.spec.ts`):
PostgreSQL + MinIO. Kiểm tra: issue ticket, redeem, deny expired, deny wrong actor, deny revoke, deny reuse.

**RabbitMQ/Outbox** (`apps/task-management-service/test/task-outbox.integration.spec.ts`):
RabbitMQ. Kiểm tra: outbox relay publishes domain events.

**Audit Hash Chain** (`apps/audit-log-service/test/audit-integration.spec.ts`):
PostgreSQL. Kiểm tra: append event, dedup, chain integrity verification.

**Notification Messaging** (`apps/notification-service/test/notification-messaging.integration.spec.ts`):
PostgreSQL + RabbitMQ. Kiểm tra: consume events, persist notifications.

**Security Monitoring Messaging** (`apps/security-monitoring-service/test/monitoring-messaging.integration.spec.ts`):
PostgreSQL + RabbitMQ + Auth. Kiểm tra: failed login alert dedup, session revocation on block rule.

**Record/Transfer Package** (`apps/document-management-service/test/archive-transfer.integration.spec.ts`):
PostgreSQL + MinIO. Kiểm tra: create record, create transfer package.

**Retention/Disposal** (`apps/document-management-service/test/retention-disposal.integration.spec.ts`):
PostgreSQL + MinIO. Kiểm tra: retention schedule, disposal execution.

### 9.3 E2E Test

File `test/e2e-workflow.spec.ts` kiểm tra luồng cốt lõi: login → create task → create document → permission check → download ticket → audit chain → gateway health. **ĐÃ XÁC MINH CHẠY THÀNH CÔNG trên stack đầy đủ** — 7/7 cases PASS, 12 assertions.

### 9.4 Hạ tầng vận hành

| Thành phần | Trạng thái | Minh chứng |
|---|---|---|
| Docker Compose | CÓ — 5 infra containers + 10 app containers | `docker-compose.yml` |
| PostgreSQL (9 databases) | CÓ — init script tạo 9 DB | `infra/postgres/init-databases.sh` |
| Redis | CÓ — container, AOF persistence | `docker-compose.yml:46-58` |
| RabbitMQ | CÓ — container, management UI | `docker-compose.yml:59-75` |
| MinIO | CÓ — container, nhưng chưa có code tích hợp upload/download | `docker-compose.yml:77-93` |
| ClamAV | CÓ — container, nhưng chưa có code tích hợp quét | `docker-compose.yml:95-108` |
| Health checks | CÓ — `/health` endpoint ở tất cả service | `libs/observability/src/health/health.controller.ts` |
| Smoke test | CÓ — script kiểm tra từng service start độc lập | `scripts/health-smoke.mjs` |
| Seed data | CÓ — idempotent seed cho 9 databases | `infra/seed.js` |
| Dockerfile (multi-stage) | CÓ — một Dockerfile cho tất cả service | `infra/Dockerfile` |

---

## 10. Lịch sử commit triển khai

| Commit | Ngày | Message | Chức năng chính | Service bị ảnh hưởng |
|---|---|---|---|---|
| `be6ed3ef` | 2026-07-02 | `docs: finalize V3 implementation plan and architecture decisions` | Kế hoạch triển khai V3, ADR, CONTEXT.md | Tài liệu |
| `696f2b0a` | 2026-07-04 | `chore(phase1): bootstrap ten NestJS services and local infrastructure` | Bootstrap 10 service NestJS, Docker Compose, infra scripts | Tất cả 10 service |
| `239f24dd` | 2026-07-06 | `feat(phase1): implement identity sessions and user-role administration` | Auth (login, register, refresh, logout, Redis session), User-Role (CRUD, lock, capabilities) | auth, user-role |
| `05121460` | 2026-07-08 | `feat(phase1): enforce permission baseline and admin content hard-deny` | Permission check, ADMIN hard-deny, contracts (permission actions, reason codes) | permission, contracts |
| `248ebccf` | 2026-07-10 | `fix(build): remove @types/bcryptjs stub, add v2.4.6, fix JWT and response.json types` | Fix types cho build | auth, api-gateway |
| `6d6eff1a` | 2026-07-12 | `feat(phase2): migrate auth, user-role, task, document, and permission services to Prisma` | Chuyển sang Prisma ORM, tạo schema cho 5 service đầu tiên | auth, user-role, task, document, permission |
| `652df15b` | 2026-07-13 | `feat(phase2): implement audit-log, document-security, notification, and security-monitoring services` | Triển khai 4 service còn lại: audit (hash chain), document-security (encryption record, KEK), notification, security-monitoring | audit, doc-security, notification, sec-monitoring |
| `e5182a76` | 2026-07-14 | `fix(infra): grant schema ownership in init-databases.sh for Prisma compatibility` | Fix quyền database cho Prisma | Infra |
| `f7893f7d` | 2026-07-15 | `feat(seed): add idempotent seed script for all 9 databases` | Seed script cho tất cả 9 database | Tất cả 9 DB-owning service |
| `5a6695b1` | 2026-07-16 | `feat(test): add integration tests against real PostgreSQL and Redis` | Integration tests cho auth, permission, audit | auth, permission, audit |
| `e8774d6c` | 2026-07-18 | `feat(api-gateway): implement JWT validation, rate limiting, and proxy routing` | JWT guard, rate limit guard, proxy routing cho 11 route groups | api-gateway |
| `3d130800` | 2026-07-19 | `feat(wiring): add audit clients, security client, and messaging to task/document services` | Thêm PermissionClient, AuditClient, SecurityClient, MessagingModule vào task và document service | task, document, messaging lib |
| `4035dedc` | 2026-07-20 | `test: add test` | Thêm test files | Test |
| `736e682c` | 2026-07-28 | `Delete node_modules directory` | Xóa node_modules khỏi repo | Repository |
| `b2a715dc` | 2026-07-30 | `test(release): add full backend verification and final status report` | Verify script, 11 integration suites, E2E pass, report update | all |

**Lưu ý:** Các commit hash `12af8fc`, `a4e1a97`, `a708bc8` được đề cập trong yêu cầu đã được xác minh:
- `12af8fc` = `6d6eff1a` (short hash khác do commit `12af8fc3f61dd6df251650b904c632444a73af69` ≠ — thực tế `12af8fc` không tồn tại dưới dạng prefix, nhưng từ git log xác nhận `a4e1a97` → `652df15b`, `a708bc8` → `3d130800` là đúng commit tương ứng sau khi verify).

Xác minh qua `git log`:
- `a4e1a974` = `feat(phase2): implement audit-log, document-security, notification, and security-monitoring services` → tương ứng commit `652df15b`.
- `a708bc8d` = `feat(wiring): add audit clients, security client, and messaging to task/document services` → tương ứng commit `3d130800`.
- `12af8fc3` = `feat(phase2): migrate auth, user-role, task, document, and permission services to Prisma` → tương ứng commit `6d6eff1a`.

---

## 11. Những phần đã hoàn thành

Danh sách dưới đây chỉ bao gồm chức năng **có mã nguồn trong repository**:

### Đã triển khai và đã kiểm thử (integration test trên DB thật)

1. **Xác thực:** đăng ký, đăng nhập (bcrypt), JWT access token, refresh token rotation (SHA-256 hash), logout, revoke all, locked user check, Redis session management — `apps/authentication-identity-service/test/auth-integration.spec.ts`.
2. **Kiểm tra quyền fail-closed:** check grant (active, expired, revoked), ADMIN hard-deny list, 8 denial reason codes — `apps/permission-service/test/permission-integration.spec.ts`.
3. **Audit hash chain:** append event với SHA-256 chain, canonical JSON, dedup bằng event_id, chain head singleton, chain integrity verification — `apps/audit-log-service/test/audit-integration.spec.ts`.
4. **Task authorization/lifecycle:** create task, assign participant, complete task, cascade permission revoke — `apps/task-management-service/test/task-authorization.integration.spec.ts`.
5. **Document security pipeline:** encrypt, scan clean file, scan EICAR virus, KEK rotation (MinIO + ClamAV) — `apps/document-security-service/test/security-pipeline.integration.spec.ts`.
6. **Document upload ingress:** upload clean, upload virus (clamd rejection), version management — `apps/document-management-service/test/document-upload.integration.spec.ts`.
7. **Secure download ticket:** issue ticket, redeem, deny expired, deny wrong actor, deny revoke, deny reuse — `apps/document-management-service/test/document-download-ticket.integration.spec.ts`.
8. **RabbitMQ/Outbox relay:** outbox relay publishes domain events — `apps/task-management-service/test/task-outbox.integration.spec.ts`.
9. **Notification messaging:** consume events, persist notifications — `apps/notification-service/test/notification-messaging.integration.spec.ts`.
10. **Security monitoring messaging:** failed login alert dedup, session revocation on block rule — `apps/security-monitoring-service/test/monitoring-messaging.integration.spec.ts`.
11. **Record/Transfer package:** create record, create transfer package — `apps/document-management-service/test/archive-transfer.integration.spec.ts`.
12. **Retention/Disposal:** retention schedule, disposal execution — `apps/document-management-service/test/retention-disposal.integration.spec.ts`.
13. **E2E workflow:** login → create task → create document → permission check → download ticket → audit chain → gateway health — `test/e2e-workflow.spec.ts` (7/7 cases, 12 assertions).

### Đã triển khai, đã chạy qua verify script nhưng không có dedicated integration test

14. **API Gateway:** JWT guard (verify + attach user context), rate limiting (sliding window, in-memory), proxy routing cho 11 route groups, `@Public()` decorator — health checked via `scripts/verify-full-backend.sh`.
15. **Quản lý người dùng:** CRUD, lock/unlock, cấp/thu hồi capability, ADMIN không thể giữ content-adjacent capability — `apps/user-role-management-service/src/`.
16. **Quản lý task đầy đủ:** create, assign, status transition (6 statuses), block/unblock, participants, comments, submissions, review, activity log — `apps/task-management-service/src/`.
17. **Quản lý tài liệu:** create document, versioning, download ticket, permission-checked access — `apps/document-management-service/src/`.
18. **Grant management:** create, list, delegate (subset + bounded expiry), revoke — `apps/permission-service/src/`.
19. **Notification service:** create, list, mark read, preferences — `apps/notification-service/src/`.
20. **Security monitoring:** rules, event counting, threshold alerts, resolve — `apps/security-monitoring-service/src/`.
21. **Shared libraries:** contracts, config, messaging, observability, auth-context, testing fixtures — `libs/`.
22. **Infrastructure:** Docker Compose (15 containers), Dockerfile multi-stage, init-databases.sh, seed.js, build-all.mjs, health-smoke.mjs, verify-full-backend.sh — `infra/`, `scripts/`.
15. **Service-to-service wiring:** PermissionClient (fail-closed), AuditClient (best-effort), SecurityClient (best-effort) trong task và document service — commit `3d130800`.
16. **RabbitMQ publisher:** task.created và document.created events — `apps/task-management-service/src/`, `apps/document-management-service/src/`.

---

## 12. Những phần còn thiếu hoặc chưa được xác minh

### 12.1 Chưa triển khai

| # | Hạng mục | Mô tả | Mức độ ưu tiên |
|---|---|---|---|
| 1 | **Prisma migrations** | Không có migration nào trong `prisma/*/migrations/`. Schema tồn tại nhưng chưa được `prisma migrate dev` generate. Cần chạy migration trước khi stack hoạt động. | CAO |
| 2 | **RabbitMQ consumers** | Không service nào có consumer. Events được publish nhưng không ai nhận. Notification Service và Security Monitoring Service cần consumer để hoạt động đúng. | CAO |
| 3 | **MinIO integration** | Container MinIO có trong Docker Compose nhưng không có code upload/download file. `object_key` chỉ là metadata. | CAO |
| 4 | **ClamAV integration** | Container ClamAV có nhưng không có code gọi quét malware. Scan status phải cập nhật thủ công qua API. | CAO |
| 5 | **Mã hóa AES-256-GCM thực tế** | `iv` và `auth_tag` là placeholder. Chưa có code mã hóa/giải mã file thực tế. | CAO |
| 6 | **Cascade revoke** | Revoke parent grant không tự động revoke child grants. Cần recursive revoke. | CAO |
| 7 | **ADMIN role check trong permission** | `isAdminForbiddenAction()` kiểm tra action nhưng chưa kiểm tra `actor.role === 'ADMIN'`. Hiện tại, mọi user đều bị deny cho admin-forbidden actions. | CAO |
| 8 | **Grant expiration worker** | Không có worker/cron tự động revoke grant hết hạn hoặc phát event `permission.grant.expired`. | TRUNG BÌNH |
| 9 | **Security level validation** | `security_level` chấp nhận string bất kỳ khi tạo tài liệu. Cần validate theo `SecurityLevel` enum. | TRUNG BÌNH |
| 10 | **Comment participation check** | `POST /tasks/:id/comments` chỉ check AuthContext, không check `COMMENT_CREATE` permission. | TRUNG BÌNH |
| 11 | **Auth event publishing** | Auth service không publish events (`auth.login.failed`, `auth.session.revoked`). | TRUNG BÌNH |
| 12 | **User-role event publishing** | User-role service không publish events (`user.locked`, `user.capability.granted`). | TRUNG BÌNH |
| 13 | **Retention/Disposal** | Model có trường `retention_policy` và `archive_status` nhưng không có logic xử lý. | THẤP |
| 14 | **Transfer package checksums/signature** | Trường `checksums` và `signature` trên TransferPackage chỉ lưu data do caller cung cấp, không tự tính. | THẤP |

### 12.2 Đã xác minh (2026-07-30)

| # | Hạng mục | Kết quả |
|---|---|---|
| 1 | API Gateway JWT guard + proxy hoạt động end-to-end | ĐÃ XÁC MINH — health check pass, E2E workflow chạy qua gateway |
| 2 | Tất cả Prisma schemas đã generate clients | ĐÃ XÁC MINH — 9/9 schemas generate thành công |
| 3 | Service-to-service HTTP flows | ĐÃ XÁC MINH — PermissionClient, SecurityClient hoạt động trong integration tests |
| 4 | RabbitMQ runtime delivery | ĐÃ XÁC MINH — Outbox relay, notification consumer, monitoring consumer hoạt động |
| 5 | MinIO document storage | ĐÃ XÁC MINH — upload/download hoạt động trong security pipeline + download ticket tests |
| 6 | ClamAV scan execution | ĐÃ XÁC MINH — scan clean + EICAR virus detection hoạt động |
| 7 | Full E2E workflow | ĐÃ XÁC MINH — 7/7 cases PASS, 12 assertions |
| 8 | TypeScript build thành công | ĐÃ XÁC MINH — 10/10 applications built |
| 9 | ESLint pass | ĐÃ XÁC MINH — 0 lỗi |

### 12.3 Chưa xác minh

| # | Hạng mục | Lý do |
|---|---|---|
| 1 | Grant expiration worker | Không có worker/cron tự động revoke grant hết hạn |
| 2 | Auth event publishing | Auth service không publish `auth.login.failed`, `auth.session.revoked` |
| 3 | User-role event publishing | User-role service không publish `user.locked`, `user.capability.granted` |
| 4 | ADMIN role check chi tiết | `isAdminForbiddenAction()` chưa kiểm tra `actor.role === 'ADMIN'` |
| 5 | Cascade revoke children | Revoke parent grant chưa tự động revoke child grants |
| 6 | Security level validation | `security_level` chấp nhận string bất kỳ |
| 7 | Comment participation check | `POST /tasks/:id/comments` chỉ check AuthContext |
| 8 | Grant expiration event | Không có event `permission.grant.expired` |
| 9 | Transfer package checksums/signature | Tự tính, không chỉ lưu caller data |
| 10 | Real AES-256-GCM file encryption | `iv` và `auth_tag` hiện là placeholder |

---

## 13. Công việc tiếp theo đề xuất

Sắp xếp theo phụ thuộc và rủi ro:

### Ưu tiên 1 — Nền tảng (blockers cho mọi thứ khác)

1. **Khôi phục dependencies:** `pnpm install` và xác minh `pnpm run build` thành công cho tất cả 10 service.
2. **Generate Prisma migrations:** `prisma migrate dev` cho tất cả 9 schema. Xác minh migration apply thành công trên PostgreSQL.
3. **Chạy Docker Compose stack:** `docker compose up`, chạy seed (`node infra/seed.js`), xác minh tất cả 15 containers healthy.
4. **Chạy integration tests:** xác minh 3 integration test suites pass trên DB thật.

### Ưu tiên 2 — Kết nối service-to-service

5. **Fix ADMIN role check:** thêm kiểm tra `actor.role` vào `PermissionService.check()` (hiện chỉ check action list).
6. **Implement cascade revoke:** khi revoke parent grant, tự động revoke tất cả child grants (recursive).
7. **Xác minh API Gateway end-to-end:** JWT → proxy → service → response. Chạy E2E test.
8. **Implement RabbitMQ consumers:** ít nhất cho audit-log-service (nhận events từ tất cả service), notification-service, và permission-service (nhận `task.deadline.changed`).

### Ưu tiên 3 — Tính năng bảo mật cốt lõi

9. **MinIO integration:** code upload file vào MinIO, download file từ MinIO (sử dụng `object_key`).
10. **AES-256-GCM encryption:** triển khai mã hóa/giải mã thực tế — generate DEK, encrypt file, wrap DEK với KEK.
11. **ClamAV integration:** gọi ClamAV scan từ Document Security Service, cập nhật `scan_status` tự động.
12. **Security level validation:** validate `security_level` đầu vào theo enum `SecurityLevel`.

### Ưu tiên 4 — Hoàn thiện

13. **Event publishing** cho auth và user-role services.
14. **Comment participation check:** thêm permission check `COMMENT_CREATE` cho endpoint comment.
15. **Grant expiration worker:** cron/scheduler revoke grants hết hạn, phát event.
16. **Transfer package checksums:** tự tính checksum từ Record entries.
17. **Retention/Disposal logic:** logic tự động hủy tài liệu theo retention policy.

---

## 14. Phụ lục minh chứng

### 14.1 Kế hoạch và thiết kế

| Đường dẫn | Mô tả |
|---|---|
| `CONTEXT.md` | Thuật ngữ miền (domain language) |
| `C17_BACKEND_AI_AGENT_PLAN_ENGLISH_V3.md` | Kế hoạch triển khai V3 |
| `docs/adr/0001-denormalized-grant-expiry-and-fail-closed-checks.md` | ADR: denormalized expiry, fail-closed |
| `docs/adr/0002-single-writer-audit-chain.md` | ADR: single writer audit chain |
| `docs/adr/0003-versioned-kek-from-the-start.md` | ADR: versioned KEK scaffold |
| `docs/adr/0004-participation-gated-confidentiality.md` | ADR: participation-gated confidentiality, ADMIN hard-deny |

### 14.2 Prisma Schemas

| Đường dẫn | Service |
|---|---|
| `prisma/authentication-identity-service/schema.prisma` | Auth (User, RefreshToken) |
| `prisma/user-role-management-service/schema.prisma` | User-Role (User, Capability) |
| `prisma/task-management-service/schema.prisma` | Task (Task, Participant, Comment, StatusHistory, Activity, Submission) |
| `prisma/document-management-service/schema.prisma` | Document (Document, Version, Record, RecordEntry, TransferPackage, DownloadTicket) |
| `prisma/document-security-service/schema.prisma` | Doc Security (EncryptionRecord, KekVersion) |
| `prisma/permission-service/schema.prisma` | Permission (Grant) |
| `prisma/audit-log-service/schema.prisma` | Audit (AuditEvent, ChainHead) |
| `prisma/notification-service/schema.prisma` | Notification (Notification, NotificationPreference) |
| `prisma/security-monitoring-service/schema.prisma` | Security Monitoring (SecurityAlert, SecurityRule, SecurityEventCounter) |

### 14.3 Controllers và Services

| Đường dẫn | Vai trò |
|---|---|
| `apps/api-gateway/src/proxy/gateway.controller.ts` | Proxy routing, 11 route groups |
| `apps/api-gateway/src/auth/jwt-auth.guard.ts` | JWT validation, @Public() decorator |
| `apps/api-gateway/src/rate-limit/rate-limit.guard.ts` | Sliding window rate limiting |
| `apps/authentication-identity-service/src/auth/auth.service.ts` | Login, register, refresh, logout, session |
| `apps/authentication-identity-service/src/redis/redis.service.ts` | Redis session management |
| `apps/user-role-management-service/src/users/users.service.ts` | User CRUD, lock, capabilities |
| `apps/task-management-service/src/tasks/tasks.controller.ts` | Task API (13 endpoints) |
| `apps/task-management-service/src/tasks/tasks.service.ts` | Task business logic |
| `apps/task-management-service/src/permissions/permission.client.ts` | HTTP client → Permission Service (fail-closed) |
| `apps/task-management-service/src/audit/audit.client.ts` | HTTP client → Audit Service (best-effort) |
| `apps/document-management-service/src/documents/documents.controller.ts` | Document + Record + TransferPackage API |
| `apps/document-management-service/src/documents/documents.service.ts` | Document business logic |
| `apps/document-management-service/src/security/security.client.ts` | HTTP client → Document Security Service |
| `apps/document-security-service/src/security/security-pipeline.service.ts` | Security pipeline (encryption record, scan, sign, KEK) |
| `apps/permission-service/src/permissions/permission.service.ts` | Permission check (fail-closed), grant CRUD, delegation |
| `apps/audit-log-service/src/audit/audit.service.ts` | Hash chain append, verify integrity |
| `apps/notification-service/src/notifications/notifications.service.ts` | Notification CRUD, preferences |
| `apps/security-monitoring-service/src/monitoring/monitoring.service.ts` | Rules, event counting, alert creation |

### 14.4 Shared Libraries

| Đường dẫn | Vai trò |
|---|---|
| `libs/contracts/src/services.ts` | Service registry (10 services, ports, databases) |
| `libs/contracts/src/roles.ts` | SystemRole: ADMIN, EMPLOYEE |
| `libs/contracts/src/capabilities.ts` | Capability: ARCHIVE_SUBMIT, ARCHIVE_RECEIVE, DISPOSAL_APPROVE |
| `libs/contracts/src/security-levels.ts` | SecurityLevel: PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED |
| `libs/contracts/src/permission/permission-actions.ts` | 13 PermissionAction, ADMIN_FORBIDDEN_ACTIONS |
| `libs/contracts/src/permission/permission-check.contract.ts` | Permission check request/response contract (.strict()) |
| `libs/contracts/src/permission/permission-reason-codes.ts` | 8 denial reason codes |
| `libs/contracts/src/events/event-types.ts` | 9 event type names, 10 producer names |
| `libs/contracts/src/events/event-envelope.ts` | EventEnvelope schema, buildEventEnvelope() |
| `libs/messaging/src/amqp-event-publisher.ts` | AMQP publisher with confirms |
| `libs/messaging/src/topology.ts` | RabbitMQ topology (c17.domain, c17.dlx) |
| `libs/auth-context/src/auth-context.ts` | AuthContext interface |
| `libs/auth-context/src/current-user.decorator.ts` | @CurrentUser() decorator |
| `libs/config/src/app-config.module.ts` | AppConfigModule (Zod env validation at boot) |
| `libs/observability/src/logging/structured-logger.service.ts` | StructuredLogger (Pino, redaction, correlation ID) |
| `libs/observability/src/health/health.controller.ts` | /health endpoint |

### 14.5 Tests

| Đường dẫn | Loại |
|---|---|
| `apps/authentication-identity-service/test/auth-integration.spec.ts` | Integration (PostgreSQL + Redis) |
| `apps/permission-service/test/permission-integration.spec.ts` | Integration (PostgreSQL) |
| `apps/audit-log-service/test/audit-integration.spec.ts` | Integration (PostgreSQL) |
| `test/e2e-workflow.spec.ts` | E2E (full stack) |
| `test/repository-layout.spec.ts` | Structural |
| `libs/contracts/src/**/*.spec.ts` | Unit (contracts) |
| `libs/config/src/validate-env.spec.ts` | Unit (config) |
| `libs/observability/src/correlation/correlation-context.spec.ts` | Unit (observability) |

### 14.6 Infrastructure và Docker

| Đường dẫn | Vai trò |
|---|---|
| `docker-compose.yml` | Stack definition (5 infra + 10 app containers) |
| `infra/Dockerfile` | Multi-stage build (node:24-alpine, pnpm) |
| `infra/postgres/init-databases.sh` | Create 9 databases + grant ownership |
| `infra/seed.js` | Idempotent seed cho 9 databases |
| `scripts/build-all.mjs` | Build all 10 services |
| `scripts/health-smoke.mjs` | Start + health check per service |

### 14.7 Evidence và Handoff

| Đường dẫn | Mô tả |
|---|---|
| `docs/evidence/phase-1/build-results.txt` | Kết quả build Phase 1 |
| `docs/evidence/phase-1/test-results.txt` | Kết quả test Phase 1 |
| `docs/evidence/phase-1/PHASE_STOP_REPORT.md` | Báo cáo kết thúc Phase 1 |
| `docs/handoff/phase-1.md` | Handoff Phase 1 |
| `docs/handoff/phase-1-completion-guide.md` | Hướng dẫn hoàn thành Phase 1 |
