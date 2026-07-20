# Frontend

## Location

All frontend source code belongs under the `frontend/` directory in this repository.

## Application Type

The target is a **responsive mobile-first web application**:

- Mobile browser is the primary layout target
- Desktop browser is also supported
- One responsive codebase must serve both mobile and desktop
- This is **not** a native Android application
- This is **not** a native iOS application
- Do not create a separate `mobile/` directory
- Do not create separate mobile and desktop codebases

## Current Implementation Status

No frontend framework code has been implemented yet. The `frontend/` directory currently contains only this README.

PWA support is optional future work and must not be claimed as implemented.

## Framework

The frontend framework has not been selected by this documentation task. Do not fabricate an existing React, Vue, Angular, or Next.js application. When a framework is chosen, this section will be updated.

## Getting Started

When implementing the frontend:

1. Initialize the workspace package (the `frontend/` directory is already declared in `pnpm-workspace.yaml`)
2. Select a framework and add it to `frontend/package.json`
3. Use the shared `pnpm-lock.yaml` for dependency management
4. Configure environment variables for the API Gateway base URL

## API Access Rules

The frontend must follow these rules strictly:

- **Call the API Gateway only** (port 3000 in local development)
- **Never call service ports 3001–3009 directly**
- **Never call `/internal/*` endpoints**
- **Never query service databases directly**
- **Never connect directly to Redis or RabbitMQ**
- **Never upload directly to MinIO/S3/R2**
- **Never download using `object_key` or a direct storage URL**
- **Never store storage access keys or KEKs in the browser**

## Integration Guide

For detailed API integration guidance, see:

[docs/frontend/frontend-development-guide.md](../docs/frontend/frontend-development-guide.md)

## Suggested Directory Structure

The following is a recommended convention, not implemented files:

```
frontend/
├── src/
│   ├── api/            # Centralized API client and typed endpoints
│   ├── components/     # Shared reusable UI components
│   ├── features/       # Feature modules (auth, tasks, documents, etc.)
│   ├── layouts/        # Page layout wrappers
│   ├── pages/          # Route-level page components
│   ├── router/         # Route definitions and guards
│   ├── stores/         # Global state management
│   ├── types/          # Shared TypeScript types and DTOs
│   ├── utils/          # Utility functions
│   └── assets/         # Static assets (images, icons, styles)
├── public/             # Public static files
├── package.json
└── README.md
```

Do not create these folders during this documentation task.
