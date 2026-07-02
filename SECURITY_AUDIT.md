# Security Audit — Rare Vet LIMS

**Date:** 2026-07-03  
**Phase:** 8 — Enterprise Audit  
**Scope:** Authentication, authorization, injection, XSS, CSRF, rate limiting, uploads, secrets  
**Method:** Static code review + configuration review  
**Code changes:** None

**Security Score: 58 / 100**

---

## Summary

The application implements **standard JWT + RBAC patterns** suitable for an internal lab system. Critical gaps prevent an enterprise security sign-off: **password reset token leakage**, **plaintext device API keys**, **disabled DB TLS verification**, **unprotected upload paths**, and **insufficient rate limiting on authentication endpoints**.

---

## Authentication

### Staff Authentication

| Control | Status | Location |
|---------|--------|----------|
| Password hashing (bcrypt) | ✅ | `auth.service.js` — cost 12 on reset |
| JWT access token | ✅ | `JWT_SECRET`, default 24h expiry |
| Refresh token (hashed in DB) | ✅ | `refresh_tokens` table |
| Production JWT secret check | ✅ | `index.js` rejects default secret |
| Login rate limiting | ❌ | Only global 500/15min |
| Account lockout | ❌ | Not implemented |
| MFA | ❌ | Not implemented |
| Session revocation (access token) | ❌ | Only refresh deleted on logout |

**Flow:** `POST /api/auth/login` → bcrypt verify → JWT `{ userId, role }` + refresh token.

**Concern:** Within the global 500 req/15min window, an attacker can attempt many password combinations on `/auth/login` without dedicated throttling.

### Customer Portal Authentication

| Control | Status | Location |
|---------|--------|----------|
| OTP via SMS (Msegat) | ⚠️ | Disabled in render.yaml (`SMS_ENABLED=false`) |
| Static OTP (dev) | ⚠️ | `PORTAL_OTP_STATIC` — must be `off` in prod |
| Portal JWT | ✅ | `{ customerId, type: 'customer' }` |
| OTP rate limit | ✅ | 10 req / 15 min on portal auth routes |
| Shared JWT secret with staff | ⚠️ | Same `JWT_SECRET` — compromise affects both |

**Concern:** Production portal requires SMS provider credentials. Without SMS, OTP flow may fail or rely on unsafe fallbacks.

### Device Authentication

| Control | Status | Location |
|---------|--------|----------|
| API key header | ✅ | `X-Device-Key` or `body.api_key` |
| Key storage | ❌ **HIGH** | Plaintext in `device_integrations.api_key` |
| Key comparison | ❌ **HIGH** | String equality in `deviceAuth.js` |
| Key rotation | ⚠️ | Manual via admin UI |

**Recommendation:** Store bcrypt hash of API key; show key once on creation only.

---

## Authorization

### RBAC Model

- **File:** `backend/src/utils/permissions.js`
- **~40 permission codes**, 7 predefined roles.
- **`authorize(...perms)`** — grants if user has ANY listed permission OR `role_name === 'admin'`.
- Permissions loaded from DB on **every authenticated request** (2 queries).

### Strengths

- Consistent permission checks on route level.
- Portal routes use separate `authenticateCustomer` middleware.
- Protected upload prefixes require staff JWT (`reports/`, `invoices/`, `microscope/`).

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| Admin bypass hardcoded | Low | String `'admin'` in middleware |
| Client-only permission UI | Info | Frontend guards not a security boundary |
| Debug device endpoints | Medium | `/devices/ref-debug/*` in production |
| Destructive ops | Medium | `DELETE /devices/reference-ranges/all` with `DEVICES_MANAGE` |
| Users PUT unvalidated | Medium | Admin can send arbitrary body fields |
| Role permission mutation | Medium | No schema validation on permission arrays |

---

## JWT Security

| Topic | Finding |
|-------|---------|
| Algorithm | HS256 (jsonwebtoken default) |
| Secret management | Render auto-generates `JWT_SECRET` ✅ |
| Dev default | `'dev-secret-change-me'` — blocked in prod startup ✅ |
| Token in URL | ⚠️ `?access_token=` for protected uploads — Referer/log leakage |
| Token storage (frontend) | ⚠️ localStorage — XSS → token theft |
| Portal token separation | ⚠️ Same signing secret, different claim `type` |

---

## SQL Injection

**Assessment: LOW RISK**

- All service queries use parameterized `$1, $2...` via `pg`.
- Dynamic WHERE clauses build placeholder indices, not string concatenation of user input.
- Static SQL fragments (timezone, barcode helpers) use fixed values.

**Exceptions (script-only, not request path):**
- `migrate.js` — ALTER TABLE with const table names
- `users.service.js` — UPDATE with table/column from const array `USER_REF_UPDATES`

**No evidence of user-controlled SQL interpolation in API hot paths.**

---

## XSS (Cross-Site Scripting)

### Backend

- JSON API responses — no HTML rendering.
- PDF generation uses controlled templates.

### Staff Frontend

- **No `dangerouslySetInnerHTML`** in React components ✅
- **Print utilities** use `document.write` / `innerHTML` with cloned DOM:
  - `labReportPrint.js` — trusts rendered report HTML
  - `labelPrintHtml.js` — uses `escapeHtml()` on label fields ✅

### Customer Portal

- React text rendering ✅
- Report sections from API — structured JSON

**Risk:** If malicious data entered in result notes/customer names and rendered in print pipeline without escaping, print iframe could execute. Current React JSX rendering mitigates display XSS.

---

## CSRF

**Status: NOT IMPLEMENTED**

Mitigating factors:
- API uses Bearer JWT in `Authorization` header (not cookie-based).
- CORS restricted to whitelisted origins on `/api`.

Residual risk:
- If cookies added in future without CSRF tokens, exposure increases.
- `access_token` query param on uploads behaves like a bearer token in URL.

---

## Rate Limiting

| Endpoint | Limit | File |
|----------|-------|------|
| All `/api/*` (production) | 500 / 15 min | `app.js` |
| Portal OTP | 10 / 15 min | `portal.routes.js` |
| Login | **None dedicated** | `auth.routes.js` |
| Device ingest | Global only | `devices.routes.js` |

**Recommendation:** Add `express-rate-limit` on `/auth/login` (5/15min per IP) and `/auth/forgot-password`.

---

## File Upload Security

### Multer Configuration

| Route | Max size | MIME filter |
|-------|----------|-------------|
| Animal image | 5 MB | ❌ None |
| Result attachments | 20 MB | ✅ Image heuristics |

### Storage Access Control

| Prefix | Auth required |
|--------|---------------|
| `reports/` | ✅ Staff JWT |
| `invoices/` | ✅ Staff JWT |
| `microscope/` | ✅ Staff JWT |
| `ministry-docs/` | ✅ Staff JWT |
| `animals/` | ❌ **Public if URL known** |
| `signatures/` | ❌ **Public if URL known** |
| `temp/` | ❌ **Public if URL known** |

**Concerns:**
- UUID filenames provide obscurity, not authorization.
- Animal uploads accept any file type (potential malware storage).
- S3 mirror failure falls back to local-only silently.

---

## Secrets & Environment Variables

### Production (Render)

| Secret | Handling |
|--------|----------|
| `JWT_SECRET` | Auto-generated ✅ |
| `DATABASE_URL` | Render managed ✅ |
| `ADMIN_INITIAL_PASSWORD` | Manual sync ✅ |
| `MSEGAT_*` | Manual sync (SMS off by default) |
| `S3_*` | Optional, not configured in blueprint |

### Development Risks

| Variable | Default | Risk |
|----------|---------|------|
| `JWT_SECRET` | `dev-secret-change-me` | Blocked in prod ✅ |
| `DB_*` | `lims_user/lims_password` | Local only |
| `PORTAL_OTP_STATIC` | May enable static OTP | Must be `off` in prod |

### HIGH Finding: Password Reset Token Leak

```javascript
// auth.service.js:100
return { message: 'If the email exists...', resetToken: token };
```

**Impact:** Any caller who submits a valid email receives the reset token in the JSON response, bypassing email delivery entirely.

**Fix:** Remove `resetToken` from response; send via email/SMS only.

---

## TLS / Transport

| Connection | TLS | Notes |
|------------|-----|-------|
| Client → Render | ✅ | HTTPS enforced |
| App → PostgreSQL | ⚠️ | `rejectUnauthorized: false` in `database.js` |
| Bridge → Cloud API | ✅ | HTTPS to lims.rarevetcare.com |
| Zebra bridge (local) | ⚠️ | Self-signed HTTPS on LAN |

**DB TLS finding:** Production pool disables certificate verification — vulnerable to MITM on database connection path.

---

## Audit Logging

| Module | Coverage |
|--------|----------|
| HTTP audit middleware | customers, animals, samples (partial) |
| Workflow events | `audit_logs` module `laboratory_workflow` (when enabled) |
| Billing changes | ❌ Not in HTTP audit middleware |
| Results validation | ❌ Not in HTTP audit middleware |
| User/role changes | ❌ Not in HTTP audit middleware |
| Device config | ❌ Not in HTTP audit middleware |

**Enterprise gap:** Incomplete audit trail for financial and clinical data changes.

---

## API Documentation Exposure

- Swagger at `/api/docs` when `NODE_ENV !== 'production'` OR `SERVE_API_DOCS=true`.
- Default in prod: hidden ✅

---

## Security Findings Priority Matrix

| ID | Severity | Finding | Fix effort |
|----|----------|---------|------------|
| SEC-01 | **HIGH** | Password reset token in API response | 1 hour |
| SEC-02 | **HIGH** | Plaintext device API keys | 4 hours |
| SEC-03 | **HIGH** | DB TLS cert verification disabled | 1 hour |
| SEC-04 | **MEDIUM** | No login rate limit | 2 hours |
| SEC-05 | **MEDIUM** | Unprotected upload paths (animals/signatures) | 4 hours |
| SEC-06 | **MEDIUM** | JWT in localStorage (staff + portal) | 1–2 days |
| SEC-07 | **MEDIUM** | `access_token` in upload URLs | 4 hours |
| SEC-08 | **MEDIUM** | Shared JWT secret staff/portal | 4 hours |
| SEC-09 | **MEDIUM** | Incomplete audit coverage | 2–3 days |
| SEC-10 | **MEDIUM** | Animal upload no MIME filter | 2 hours |
| SEC-11 | **LOW** | CSP allows unsafe-inline | 1 day |
| SEC-12 | **LOW** | No CSRF (mitigated by Bearer) | N/A |
| SEC-13 | **LOW** | Debug device endpoints in prod | 1 hour |

---

## Compliance Notes (Lab Context)

For a veterinary medical laboratory handling client and animal data:

- **Access control:** RBAC present; audit incomplete for clinical changes.
- **Data retention:** Archive workflow defined (Phase 7); not enforced automatically.
- **Client data in portal:** OTP + JWT; depends on SMS provider security.
- **Report integrity:** PDF stored with approval metadata; verification endpoint `/reports/verify/:code`.

---

## Recommended Security Roadmap

### Week 1 (Blockers)
1. Fix SEC-01, SEC-02, SEC-03, SEC-04
2. Protect animal/signature upload paths (SEC-05)
3. Remove debug endpoints from production builds (SEC-13)

### Week 2 (Hardening)
4. Expand audit middleware to billing, results, users
5. Add MIME validation on all uploads (SEC-10)
6. Configure SMS for portal OTP; verify no debugOtp in prod

### Week 3+ (Defense in depth)
7. Strict CSP + security headers in nginx
8. Separate portal JWT secret
9. httpOnly cookie session strategy (requires frontend refactor)
10. Penetration test on public endpoints (portal OTP, verify report, device ingest)

---

*This audit is based on static analysis. Dynamic penetration testing is recommended before enterprise certification.*
