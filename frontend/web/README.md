# Web Application

- **Path:** `frontend/web/`
- **Framework decision:** Next.js
- **Language:** TypeScript
- **Primary target:** desktop/laptop browsers
- **Secondary target:** tablet browsers
- **Mobile browser support:** secondary — the official mobile app is Flutter
- **Implementation status:** Planned — not initialized

No Next.js package, source application, or framework code exists yet under
`frontend/web/`. This README documents the planned architecture.

## 1. Purpose

The Web application provides a responsive desktop/laptop-optimized interface for:

- Login and session management
- Task dashboards and task lists
- Task creation and assignment
- Task detail and lifecycle transitions
- Comments and activity logs
- Submissions and reviews
- Document list, detail, upload, and download
- Permission Grant management (create, delegate, revoke)
- Notification list and preferences
- Records and Transfer Packages
- Retention and Disposal operations where exposed
- Administrator user and capability management
- Security Alert listing and resolution

Only features supported by public backend API endpoints are listed. The Web application
is **not** the official mobile product — mobile browser layout is secondary.

## 2. Proposed Architecture

The following is a recommended convention, not implemented files:

```
frontend/web/
├── src/
│   ├── app/              Next.js App Router pages
│   ├── api/              centralized API client
│   ├── components/       shared reusable UI components
│   ├── features/         feature modules (auth, tasks, documents, etc.)
│   ├── layouts/          page layout wrappers
│   ├── stores/           global state management
│   ├── types/            TypeScript types and DTOs
│   ├── utils/            utility functions
│   └── assets/           static assets (images, icons, styles)
├── public/               public static files
├── package.json
├── next.config.*
├── tsconfig.json
└── README.md
```

Do not create these files during documentation tasks. This is a convention for future
implementation.

## 3. API Layer

Rules for the centralized API client:

- One centralized API client module — all HTTP calls go through it
- No endpoint strings scattered through components
- No direct calls to service ports (3001–3009)
- No direct calls to infrastructure (MinIO, Redis, RabbitMQ)
- Typed request and response models matching backend DTOs
- Centralized error normalization
- Correlation ID preservation from error responses
- Authentication refresh handled centrally (token refresh on 401)
- No `fetch` calls in view-only components

## 4. Authentication

### Current Backend Token Transport

- Access token: `Authorization: Bearer <token>` header
- Refresh token: returned in login/refresh response body; sent in request body for refresh/logout
- Access token TTL: 30 minutes (1800 seconds)
- Refresh token TTL: 7 days
- Refresh rotation: old refresh token is revoked, new pair issued on each refresh

### Recommended Browser Storage Strategy

The backend uses Bearer tokens. The frontend must decide how to store tokens in the
browser. Common options include:

- `localStorage` — persists across tabs, survives browser close, but vulnerable to XSS
- `sessionStorage` — per-tab, cleared on tab close
- HttpOnly cookies — set by the backend, not accessible to JavaScript

The backend does not currently set HttpOnly cookies. If cookies are desired, backend
changes would be required. The current contract returns tokens in JSON response bodies.

### Limitations

- Browser token storage is inherently less secure than native platform secure storage
- Tokens in `localStorage` or `sessionStorage` are accessible to any JavaScript on the page
- Do not log tokens, do not persist private document content in long-lived browser caches
- Handle 401 responses by clearing tokens and redirecting to login

## 5. Desktop-First UI Rules

The Web application is designed for desktop and laptop screens:

- Design primarily for widths such as laptop (1024px+) and desktop (1280px+) layouts
- Desktop navigation may use sidebar or top navigation
- Data tables may remain tables on large screens — do not convert to cards on desktop
- Split panes and dense information layouts are acceptable on large screens
- Use responsive breakpoints for tablet adaptation (768px–1023px)
- Do not copy desktop density unchanged to narrow widths — adapt layout for tablet
- Keyboard navigation must work throughout the application
- Mouse and trackpad interactions must work throughout the application
- Accessible labels and focus states are required
- Long task and document names must wrap or truncate safely
- Loading, empty, error, retry, and permission-denied states are mandatory
- Destructive actions require explicit confirmation
- Mobile browser support must not be described as the official mobile app

Do not call the design "mobile-first." The official mobile interface is the Flutter
application at `frontend/mobile/`.

## 6. Browser Security Rules

- Do not log access tokens
- Do not log refresh tokens
- Do not log Comment content
- Do not log document bytes
- Do not persist private document content in long-lived browser caches
- Sanitize file names for display
- Create temporary Blob URLs only when needed
- Revoke Blob URLs after use
- Do not expose `object_key`
- Do not render raw backend stack traces
- Do not store infrastructure secrets in `NEXT_PUBLIC_*` environment variables

## 7. Environment Variables

Only public configuration:

| Variable | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | API Gateway base URL | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_ENV` | Application environment | `development`, `staging`, `production` |
| `NEXT_PUBLIC_FEATURE_*` | Optional public feature flags | `NEXT_PUBLIC_FEATURE_NOTIFICATIONS=true` |

Never include:

- JWT signing secret
- KEK
- Database credentials
- RabbitMQ credentials
- MinIO/S3/R2 access secret
- Internal service URLs (ports 3001–3009)

## 8. Web Development Checklist

For every frontend pull request:

- [ ] TypeScript — no arbitrary `any`
- [ ] Centralized API client — no scattered `fetch` calls
- [ ] Typed DTOs matching backend contracts
- [ ] Desktop/laptop primary layout
- [ ] Tablet responsiveness
- [ ] Keyboard accessibility
- [ ] Safe Blob handling (create, revoke)
- [ ] Loading, empty, error, retry, and permission-denied states
- [ ] 401 handling (clear tokens, redirect to login)
- [ ] 403 handling (clear "access denied" message)
- [ ] 409 handling (conflict message)
- [ ] No service ports (3001–3009)
- [ ] No internal routes
- [ ] No `object_key` exposure
- [ ] No browser secret exposure
- [ ] Canonical task statuses from backend
- [ ] Correlation IDs preserved in error reports
- [ ] No sensitive data in console logging
