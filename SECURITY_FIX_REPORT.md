# Security Fix Report — Phase 9A (P0 Only)

**Date:** 2026-07-03  
**Scope:** Critical security hardening — no new features  
**Migration:** **None required**

---

## Summary

Phase 9A closes the **five P0 security gaps** identified in Phase 8 audit without modifying Report Builder, Workflow, Barcode, Device Mapping, Reference/Result Engines, or Portal logic.

---

## 1. Forgot Password — FIXED

### Before
`POST /api/auth/forgot-password` returned `{ resetToken: token }` in JSON — account takeover risk.

### After
- Token generated internally, stored as SHA-256 hash in DB (unchanged).
- Response is **always** generic: `{ message: 'If the email exists, a reset link will be sent' }`.
- Delivery via notification queue when enabled:
  - **Email** if `EMAIL_ENABLED=true`
  - **SMS** if `SMS_ENABLED=true` and user has phone
- Dev-only: link logged at `debug` level (never in API response).

### Files
- `backend/src/services/auth.service.js`
- `backend/src/services/notification-providers/email.provider.js` (stub for email channel)
- `backend/src/services/notification-providers/index.js`

---

## 2. Device API Keys — FIXED (no migration)

### Before
Plaintext `api_key` in `device_integrations.config` JSON; string equality check.

### After
- New keys stored as **`api_key_hash`** (bcrypt) + **`api_key_prefix`** (first 8 chars for display).
- Plaintext **`api_key` removed** from stored config.
- **`api_key_once`** returned only on `create` and `regenerate-key` (one-time display).
- All list/get responses **sanitized** — no hash or full key exposed.
- **Legacy plaintext keys** still work; auto-upgraded to hash on first successful device auth.

### Files
- `backend/src/utils/device-api-key.js` (new)
- `backend/src/middleware/deviceAuth.js`
- `backend/src/services/devices.service.js`
- `frontend/src/pages/Devices.jsx` (minimal — show key once after regenerate)

### Operator action required
Existing Norma bridge `DEVICE_API_KEY` continues working until regenerated. After regenerate, update `bridge.env` with new key (shown once).

---

## 3. Database SSL — FIXED

### Before
Production: `{ rejectUnauthorized: false }` always.

### After
| Environment | SSL |
|-------------|-----|
| Development | `false` (unchanged) |
| Production | `{ rejectUnauthorized: true }` by default |
| Render fallback | Set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` if CA not pinned |
| CA pinning | Set `DATABASE_CA_CERT` → forces `rejectUnauthorized: true` |

### Files
- `backend/src/config/database.js` — exported `buildSslConfig()`
- `backend/src/config/env.js` — `database.sslRejectUnauthorized`

---

## 4. Login Rate Limiting — FIXED

### Implementation
- **5 failed attempts / 15 minutes** per `IP + username`
- Successful logins not counted (`skipSuccessfulRequests: true`)
- Returns **429** with code `RATE_LIMITED` and clear English message

### Files
- `backend/src/middleware/loginRateLimit.js` (new)
- `backend/src/routes/auth.routes.js`

---

## 5. Upload Backup — ADDED

### Implementation
- Script: `node src/scripts/backup-uploads.js` (or `npm run backup:uploads`)
- Creates `uploads-backup-{timestamp}.tar.gz` of entire upload tree (PDFs, reports, images, attachments)
- Optional S3 upload (same credentials as storage backup)
- Retention pruning via `UPLOAD_BACKUP_RETENTION_DAYS`

### Enable
```env
UPLOAD_BACKUP_ENABLED=true
UPLOAD_BACKUP_DIR=./backups/uploads
UPLOAD_BACKUP_RETENTION_DAYS=14
UPLOAD_BACKUP_S3_PREFIX=backups/uploads
```

### Files
- `backend/src/scripts/backup-uploads.js` (new)
- `backend/src/config/env.js`
- `backend/package.json` — `backup:uploads` script
- `backend/.env.example`

### Render cron (recommended)
Schedule daily after DB backup:
```yaml
schedule: "30 3 * * *"
startCommand: node src/scripts/backup-uploads.js
envVars:
  - key: UPLOAD_BACKUP_ENABLED
    value: "true"
```

---

## Review Items — No Change Required

| Area | Status | Notes |
|------|--------|-------|
| SQL Injection | ✅ Already safe | Parameterized queries throughout |
| XSS (API) | ✅ | JSON responses only |
| CORS | ✅ | Whitelist on `/api` — no change |
| Helmet | ✅ | Already enabled — no change |
| JWT prod secret guard | ✅ | Already in `index.js` — no change |
| Portal | ✅ | Not modified per scope |
| Workflow / Engines | ✅ | Not modified |

---

## System Impact

| Change | Impact | Breaking? |
|--------|--------|-----------|
| Forgot password | Clients expecting `resetToken` in JSON will not receive it | **Intentional** — security fix |
| Device keys | API list no longer returns full key | **Intentional** — regenerate + copy once |
| Legacy device keys | Continue working; auto-hash on use | **No break** |
| DB SSL strict default | Render may need `DATABASE_SSL_REJECT_UNAUTHORIZED=false` until CA set | **Config only** |
| Login rate limit | Brute-force blocked after 5 failures | **No break** for normal users |
| Upload backup | Opt-in via env | **No impact** when disabled |

---

## Remaining HIGH Issues (post-9A)

| ID | Issue | Status |
|----|-------|--------|
| SEC-01 | Password reset token in API | ✅ **Fixed** |
| SEC-02 | Plaintext device API keys | ✅ **Fixed** |
| SEC-03 | DB TLS verification | ✅ **Fixed** (default secure; Render opt-out documented) |
| SEC-04 | Login rate limit | ✅ **Fixed** |
| Upload backup automation | Manual script + env flag | ✅ **Added** (cron setup = ops task) |

### Medium items still open (Phase 9B / UAT)
- JWT in localStorage (XSS token theft)
- Unprotected upload paths (`animals/`, `signatures/`)
- `access_token` in upload URLs
- Incomplete audit middleware coverage
- SMTP not fully implemented for email password reset

---

## Verification

```bash
cd backend
node src/scripts/verify-security-phase9.js
```

Expected: **20/20 passed**

Also run regression:
```bash
node src/scripts/verify-laboratory-workflow.js
node src/scripts/verify-barcode-engine.js
```

---

## Environment Variables Added

| Variable | Default | Purpose |
|----------|---------|---------|
| `UPLOAD_BACKUP_ENABLED` | `false` | Enable uploads tarball backup |
| `UPLOAD_BACKUP_DIR` | `./backups/uploads` | Local backup directory |
| `UPLOAD_BACKUP_RETENTION_DAYS` | `14` | Prune old archives |
| `UPLOAD_BACKUP_S3_PREFIX` | `backups/uploads` | S3 key prefix |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `true` in prod | Set `false` for Render without CA |
| `DATABASE_CA_CERT` | — | PEM CA for strict TLS |
| `DATABASE_SSL` | — | Set `false` to disable SSL entirely |

---

*Phase 9A — security hardening only. No database migration executed.*
