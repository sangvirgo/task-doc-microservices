# Flutter Mobile Application

- **Path:** `frontend/mobile/`
- **Framework:** Flutter
- **Language:** Dart
- **Platforms:** Android and iOS
- **One shared Flutter codebase** for both platforms
- **Native Flutter widgets** — not a WebView wrapper
- **Not the Next.js site embedded in a mobile shell**
- **Implementation status:** Planned — not initialized

No `pubspec.yaml`, `lib/`, `android/`, or `ios/` project exists yet under
`frontend/mobile/`. This README documents the planned architecture.

## 1. Purpose

The Flutter Mobile application provides a touch-first mobile interface for:

- Login and session restoration
- Assigned task list
- Task details and lifecycle transitions
- Progress updates and submissions
- Comments where authorized
- Document metadata listing
- File upload through platform file picker
- Ticket-based secure download
- Notification list and preferences
- Records and Transfer Packages where appropriate
- Account and session handling

Not every desktop administrator workflow must be duplicated on Mobile. The Mobile
application focuses on task participation and document access workflows.

## 2. Proposed Flutter Structure

The following is a recommended convention, not implemented files:

```
frontend/mobile/
├── lib/
│   ├── core/
│   │   ├── api/              centralized Dart API client
│   │   ├── auth/             token storage and refresh
│   │   ├── config/           app configuration
│   │   ├── errors/           typed error model
│   │   ├── routing/          navigation and routing
│   │   └── storage/          secure and local storage
│   ├── features/
│   │   ├── auth/             login, session
│   │   ├── tasks/            task list, detail, lifecycle
│   │   ├── documents/        document list, upload, download
│   │   ├── notifications/    notification list, preferences
│   │   ├── records/          record management
│   │   └── transfer_packages/  transfer package workflows
│   ├── shared/               shared widgets and utilities
│   └── main.dart
├── test/
├── android/
├── ios/
├── pubspec.yaml
└── README.md
```

Do not create these files during documentation tasks. This is a convention for future
implementation.

## 3. API Architecture

Rules for the Dart API client:

- One centralized Dart API client module
- Typed request and response models (Dart classes)
- Dart null safety enforced throughout
- Avoid arbitrary `Map<String, dynamic>` outside serialization boundaries
- Centralized auth refresh (token refresh on 401)
- Typed error model (not raw exceptions)
- Request cancellation tied to screen and app lifecycle
- Safe retry only for idempotent operations
- Never retry a single-use ticket redemption blindly
- API Gateway only — never call service ports or internal endpoints

Do not force a state-management package. Do not invent Bloc, Riverpod, Provider,
GetX, or MobX unless one is already selected during implementation.

## 4. Token Security

When implementation begins:

- Use platform-backed secure storage (e.g., `flutter_secure_storage`) for tokens
- Clear tokens on logout
- Update stored refresh token after refresh rotation
- Handle revoked sessions gracefully (clear tokens, redirect to login)
- Handle locked accounts (show account-locked message, do not retry)
- Never print tokens to device logs
- Do not store tokens in plain SharedPreferences when a secure mechanism is available

Do not claim a secure-storage package is installed unless verified in `pubspec.yaml`.

## 5. File Upload

- Choose files through a platform-appropriate file picker
- Respect Android and iOS permission and sandbox rules
- Upload multipart data through API Gateway
- Show validation and progress states
- Handle cancellation only when supported by the platform file picker
- Clean temporary local copies after upload
- Never upload directly to MinIO/S3/R2
- Never expose cryptographic internals (encryption keys, IVs, signatures)

## 6. Secure Download

- Request a backend download ticket first (`POST /api/documents/:id/download-ticket`)
- Redeem the ticket through API Gateway (`POST /api/documents/:id/versions/:version/redeem`)
- Write only to the application sandbox or a user-approved destination
- Clean temporary files after download
- Do not reuse a ticket (single-use by design)
- Do not log document bytes
- Do not expose `object_key`
- Do not generate direct storage URLs

## 7. Mobile UI Rules

- Touch-first screens with appropriate touch target sizes (minimum 44x44 points)
- Android and iOS safe areas respected
- Mobile navigation patterns (bottom navigation bar, drawer, or stack navigation)
- Compact forms suitable for mobile input
- Mobile-friendly task and document lists (cards, not desktop tables)
- Do not copy desktop table density to narrow mobile screens
- Loading, empty, error, retry, and permission-denied states
- Upload and download progress indicators
- App background/foreground lifecycle handling
- Keyboard appearance and form scrolling behavior
- Orientation handling where relevant
- No offline mutation claim unless explicitly implemented

## 8. Unsupported Claims

Do not claim these exist unless confirmed in the repository:

- Firebase Cloud Messaging (FCM) integration
- Apple Push Notification service (APNs) integration
- Background synchronization
- Offline-first support
- Biometric authentication
- Deep links or universal links
- App Store / Google Play deployment
- Local encrypted document vault

## 9. Flutter Development Checklist

For every mobile pull request:

- [ ] Dart null safety enforced
- [ ] Typed models (no raw `Map<String, dynamic>` in business logic)
- [ ] Centralized API client
- [ ] Secure token storage
- [ ] App lifecycle handling (background/foreground)
- [ ] Platform file picker and sandbox file handling
- [ ] Temporary-file cleanup after upload/download
- [ ] Android and iOS behavior verified
- [ ] Loading, empty, error, retry, and permission-denied states
- [ ] 401 handling (clear tokens, redirect to login)
- [ ] 403 handling (clear "access denied" message)
- [ ] No service ports (3001–3009)
- [ ] No internal routes
- [ ] No `object_key` exposure
- [ ] No sensitive data in device logs
- [ ] Touch targets meet minimum size requirements
- [ ] Safe areas respected on both platforms
