# Secure document preview verification

Date: 2026-08-08

## Results

- `pnpm backend:lint` — passed.
- `pnpm --filter backend format:check` — passed.
- `pnpm backend:build` — passed; 10/10 applications built.
- `NODE_ENV=test pnpm backend:test` — passed; 46 suites, 223 tests.
- Preview-focused backend suites — passed; 7 suites, 18 tests.
- `pnpm --dir frontend/web test` — passed; 18 files, 59 tests.
- `pnpm --dir frontend/web typecheck` — passed.
- `pnpm --dir frontend/web lint` — passed.
- `pnpm --dir frontend/web build` — passed.
- `docker compose build document-security-service` — passed.
- Runtime image contains `pdftoppm`, `libreoffice`, `convert`, and `fc-match`.

The renderer emits only PNG page artifacts with the watermark burned into the pixels. Original PDF/DOC/DOCX bytes are not sent to the browser.
