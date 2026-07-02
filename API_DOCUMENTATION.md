# API Documentation — Rare Vet LIMS

> **Generated:** 2026-07-03  
> **Source of truth:** `backend/src/routes/*.js`  
> **Companion docs:** `backend/API.md` (legacy summary), `DATABASE_DOCUMENTATION.md`, `DEPENDENCY_MAP.md`

---

## 1. Overview

| Item | Value |
|------|-------|
| API prefix | `/api` |
| Local base URL | `http://localhost:5000/api` |
| Production (staff) | `https://lims.rarevetcare.com/api` |
| Production (portal) | `https://portal.rarevetcare.com/api` (same backend) |
| Format | JSON (`Content-Type: application/json`) |
| Max body | 10 MB (JSON); image uploads up to 20 MB |
| Rate limit | 500 req / 15 min per IP (production, `/api` only) |
| CORS | Allowed origins from `CORS_ORIGINS`, `STAFF_APP_URL`, `PORTAL_APP_URL` |
| Static uploads | `/uploads/*` (not under `/api`) |
| OpenAPI | `/api/docs` (dev or `SERVE_API_DOCS=true`) · `/api/docs.json` |

### Architecture

```
Staff SPA  ──Bearer JWT (user)──►  /api/*
Portal SPA ──Bearer JWT (customer)► /api/portal/*
Bridge     ──X-Device-Key──────────► /api/devices/ingest/:deviceId
Public site ──no auth──────────────► /api/public/* , /api/reports/verify/*
```

---

## 2. Response format

### Success (typical)

```json
{
  "success": true,
  "data": { }
}
```

List endpoints may also return pagination at the top level:

```json
{
  "success": true,
  "data": [ ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5
  }
}
```

### Error

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": { }
  }
}
```

### Common HTTP status codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Validation / business rule |
| 401 | Missing or invalid auth |
| 403 | Insufficient permissions |
| 404 | Not found |
| 410 | Gone (disabled endpoint) |
| 429 | Rate limited (portal OTP) |
| 503 | Health check degraded |

### Common error codes

| Code | When |
|------|------|
| `UNAUTHORIZED` | Invalid/missing token |
| `FORBIDDEN` | Permission denied |
| `NOT_FOUND` | Entity missing |
| `VALIDATION_ERROR` | Joi validation failed |
| `DUPLICATE` | Unique constraint (PostgreSQL 23505) |
| `FOREIGN_KEY` | Invalid reference (23503) |
| `SCHEMA_OUTDATED` | DB column missing — run migrate |
| `NO_RESULTS` | Report generation without validated results |
| `RATE_LIMIT` | Portal OTP throttled |

---

## 3. Authentication

### 3.1 Staff JWT

**Header (all protected staff routes):**

```
Authorization: Bearer <accessToken>
```

Access token payload: `{ userId, role }`. Expiry: `JWT_EXPIRES_IN` (default `24h`).

**Login** accepts `username` field — value may be username, email, or email local-part:

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-password"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@rarevetcare.com",
      "full_name": "System Admin",
      "full_name_ar": "مدير النظام",
      "role": "admin",
      "language": "en",
      "theme": "light",
      "permissions": ["dashboard.view", "..."]
    },
    "accessToken": "eyJ...",
    "refreshToken": "hex..."
  }
}
```

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /auth/login` | None | Staff login |
| `POST /auth/refresh` | None | Body: `{ "refreshToken": "..." }` → new `accessToken` |
| `POST /auth/logout` | None | Body: `{ "refreshToken": "..." }` — invalidates refresh token |
| `POST /auth/forgot-password` | None | Body: `{ "email": "..." }` |
| `POST /auth/reset-password` | None | Body: `{ "token": "...", "password": "..." }` |
| `GET /auth/me` | Staff JWT | Current user profile + permissions |

### 3.2 Portal customer JWT

Issued after OTP verify. Token payload includes `type: "customer"` and `customerId`.

```http
POST /api/portal/auth/request-otp
{ "mobile": "966501234567" }

POST /api/portal/auth/verify-otp
{ "mobile": "966501234567", "otp": "1234" }
```

- OTP rate limit: **10 requests / 15 min** per IP
- Dev static OTP: `1234` when `SMS_ENABLED` is false and `PORTAL_OTP_STATIC` not disabled
- Token expiry: `PORTAL_JWT_EXPIRES_IN` (default `7d`)

All routes below `/api/portal/*` except OTP require:

```
Authorization: Bearer <portalAccessToken>
```

### 3.3 Device bridge key

No staff JWT. Used by `bridge/norma-listener.js`:

```http
POST /api/devices/ingest/:deviceId
X-Device-Key: <api_key from device_integrations.config>
Content-Type: application/json

{
  "message": "<raw HL7 or ASTM string>"
}
```

Alternate body fields: `raw`, `hl7`, `astm`. API key may also be sent as `api_key` in JSON body.

---

## 4. Authorization model

- **`authorize(A, B, …)`** — user needs **any one** listed permission (OR logic)
- **`admin` role** — bypasses all permission checks in `authorize()`
- **`/users/*`** — requires **`admin` role** (`requireAdmin`), not permission codes
- Permission catalog synced from `backend/src/utils/permissions.js` on migrate

See [§15 Permissions reference](#15-permissions-reference) for role defaults.

---

## 5. Health & public

### GET `/api/health`

No auth. Returns DB connectivity, storage type, frontend build presence.

```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-07-03T...",
  "database": "ok",
  "storage": { "type": "local", "writable": true },
  "frontend": { "staff": true, "portal": true }
}
```

Returns **503** when database is down.

### Public routes (`/api/public/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/public/catalog` | Active tests, categories, packages for marketing site |
| GET | `/public/lab` | Lab name, contact, portal URL (from env) |

### Settings public (`/api/settings/public`)

Same lab contact block as `/public/lab` (env-based, no DB read required for contact fields).

---

## 6. Staff API — endpoints

### 6.1 Customers `/api/customers`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/` | `customers.view` | Query: `page`, `limit`, `search`, `is_active` |
| GET | `/:id` | `customers.view` | Full profile + history |
| POST | `/` | `customers.create` | Body: `customerSchema` |
| PUT | `/:id` | `customers.update` | Body: `customerSchema` |
| DELETE | `/:id` | `customers.delete` | Soft deactivate |

### 6.2 Animals `/api/animals`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/` | `animals.view` | Paginated list |
| GET | `/:id/trends` | `results.view` | Query: `test_code`, `parameter_code` |
| GET | `/:id` | `animals.view` | Query: `history=true` for sample history |
| POST | `/` | `animals.create` | Body: `animalSchema` |
| PUT | `/:id` | `animals.update` | Body: `animalSchema` |
| POST | `/:id/image` | `animals.update` | `multipart/form-data` field `image` (max 5 MB) |
| DELETE | `/:id` | `animals.delete` | Soft deactivate |

**`animal_type`:** `camel` \| `sheep` \| `horse` \| `goat` \| `other`

### 6.3 Samples `/api/samples`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/` | `samples.view` **or** `results.upload_images` | List / search |
| GET | `/queue` | `samples.view` | Technician work queue (filtered for `lab_technician`) |
| GET | `/queue/parasitology` | `samples.view` | Parasitology upload queue |
| GET | `/scan/:barcode` | `samples.view` **or** `results.upload_images` | Barcode lookup |
| GET | `/:id` | `samples.view` **or** `results.upload_images` | Sample detail + tests |
| GET | `/:id/barcode` | `samples.view` | Barcode image/data; query `format` |
| POST | `/` | `samples.create` | Body: `sampleSchema` (requires `test_ids` or `package_ids`) |
| PATCH | `/:id/status` | `samples.update` | Body: `{ "status": "...", ... }` |

### 6.4 Tests & catalog `/api/tests`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/categories` | `tests.view` **or** `price_list.view` | Query: `all=1` includes inactive |
| POST | `/categories` | `tests.manage` | Create category |
| PUT | `/categories/:id` | `tests.manage` | Update category |
| DELETE | `/categories/:id` | `tests.manage` | Delete (if no active tests) |
| GET | `/packages` | `tests.view` **or** `price_list.view` | Query: `all=1` |
| GET | `/packages/:id` | `tests.view` **or** `price_list.view` | Package + tests |
| POST | `/packages` | `tests.manage` | Body: `packageSchema` |
| PUT | `/packages/:id` | `tests.manage` | Update package |
| DELETE | `/packages/:id` | `tests.manage` | Deactivate |
| GET | `/` | `tests.view` **or** `price_list.view` | Paginated tests |
| GET | `/:id` | `tests.view` | Test + parameters + reference ranges |
| POST | `/` | `tests.manage` | Create test |
| PUT | `/:id` | `tests.manage` | Update test |
| DELETE | `/:id` | `tests.manage` | Soft delete |
| POST | `/:id/parameters` | `tests.manage` | Add parameter |
| PUT | `/parameters/:parameterId` | `tests.manage` | Update parameter |
| DELETE | `/parameters/:parameterId` | `tests.manage` | Deactivate parameter |
| POST | `/parameters/:parameterId/ranges` | `tests.manage` | Add LIMS reference range |
| PUT | `/parameters/ranges/:rangeId` | `tests.manage` | Update reference range |
| DELETE | `/parameters/ranges/:rangeId` | `tests.manage` | Delete reference range |
| POST | `/reference-ranges/sync-from-sample/:sampleId` | `tests.manage` | Pull refs from sample/device message; body `{ "force": true }` optional |

### 6.5 LIMS reference ranges admin `/api/reference-ranges`

Requires `reference_ranges.manage` (manager, admin, veterinarian).

| Method | Path | Notes |
|--------|------|-------|
| GET | `/` | Query: `species`, `test_id`, `parameter_id`, `search`, `page`, `limit` |
| POST | `/` | Create range + audit log |
| PUT | `/:id` | Update range + audit log |
| DELETE | `/:id` | Soft deactivate (`is_active=false`) |
| GET | `/:id/logs` | Audit trail for one range |

### 6.6 Results `/api/results`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/critical` | `results.view` | Critical value alerts |
| GET | `/sample-test/:id` | `results.view` **or** `results.upload_images` | Result + values + attachments |
| GET | `/previous/:animalId/:parameterId` | `results.view` | Historical values |
| POST | `/enter` | `results.enter` **or** `results.edit` | Body: `resultEntrySchema` |
| POST | `/approve-batch` | `results.validate` | Body: `resultApproveBatchSchema` |
| POST | `/validate/:sampleTestId` | `results.validate` | Body: `resultValidateSchema` |
| POST | `/unvalidate/:sampleTestId` | `results.unvalidate` | Reopen for editing |
| POST | `/sample-test/:id/attachments` | `results.upload_images` **or** `results.enter` **or** `results.validate` | Multipart `image` or `file` |
| PATCH | `/attachments/:id` | `results.enter` **or** `results.upload_images` | Body: `{ "include_in_report": true/false, "caption": "..." }` |
| DELETE | `/attachments/:id` | `results.enter` **or** `results.validate` | Remove attachment |
| DELETE | `/sample-test/:id` | `results.enter` | Clear all results for sample test |

### 6.7 Reports `/api/reports`

| Method | Path | Auth | Permission | Notes |
|--------|------|------|------------|-------|
| GET | `/verify/:code` | **Public** | — | QR verification by code |
| GET | `/:id/preview-dev` | None | — | **Dev only** — full preview JSON |
| GET | `/` | Staff JWT | `reports.view` | Paginated list |
| POST | `/generate/:sampleId` | Staff JWT | `reports.generate` | Body: `{ "language": "ar", "treatment_recommendations": "", "approve_lab": bool, "approve_vet": bool }` |
| POST | `/:id/approve` | Staff JWT | `reports.generate` | Body: `{ "type": "lab" \| "vet" }` |
| POST | `/:id/regenerate-pdf` | Staff JWT | `reports.generate` | Rebuild stored PDF |
| GET | `/download/:filename` | Staff JWT | `reports.view` | Stream PDF file |
| GET | `/:id/preview` | Staff JWT | `reports.view` | Report DTO for HTML preview (sections when built) |

### 6.8 Devices `/api/devices`

| Method | Path | Auth | Permission | Notes |
|--------|------|------|------------|-------|
| POST | `/ingest/:deviceId` | Device key | — | Bridge HL7/ASTM ingest |
| POST | `/ingest/:deviceId/replay` | Device key | — | Body: `{ "sampleCode": "..." }` re-import |
| GET | `/reference-ranges/list` | Staff JWT | `devices.view` | Paginated device ref ranges |
| GET | `/reference-ranges/logs` | Staff JWT | `devices.view` | Change log |
| POST | `/reference-ranges/sync` | Staff JWT | `devices.manage` | **410 Gone** — sync disabled |
| POST | `/reference-ranges` | Staff JWT | `devices.manage` | Manual create |
| PUT | `/reference-ranges/:id` | Staff JWT | `devices.manage` | Manual update |
| DELETE | `/reference-ranges/all` | Staff JWT | `devices.manage` | Delete all device refs |
| GET | `/ref-debug/message/:messageId` | Staff JWT | `devices.view` | Norma ref debug |
| GET | `/ref-debug/sample/:sampleId` | Staff JWT | `devices.view` | Norma ref debug |
| GET | `/ref-debug/species-audit` | Staff JWT | `devices.view` | Cross-species audit |
| GET | `/` | Staff JWT | `devices.view` | List integrations |
| POST | `/` | Staff JWT | `devices.manage` | Create device (auto `api_key` in config) |
| PUT | `/:id` | Staff JWT | `devices.manage` | Update device |
| POST | `/:id/regenerate-key` | Staff JWT | `devices.manage` | New API key |
| POST | `/:id/messages` | Staff JWT | `devices.manage` | Manual message inject |
| GET | `/:id/messages` | Staff JWT | `devices.view` | Message history |

### 6.9 Billing `/api/billing`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/dashboard-summary` | `billing.view` | Query: `date` |
| GET | `/daily-summary` | `billing.view` | Query: `date` |
| GET | `/daily-closing` | `billing.view` | Query: `date` |
| GET | `/daily-closing/history` | `billing.view` | Query: `limit` |
| POST | `/daily-closing/close` | `billing.day_close` | Body: `{ "date": "YYYY-MM-DD" }` |
| POST | `/daily-closing/reopen` | `billing.day_reopen` | Body: `{ "date": "..." }` |
| GET | `/daily-closing/:id/pdf` | `billing.view` | Closing PDF stream |
| GET | `/invoices/export/csv` | `billing.view` | CSV download (UTF-8 BOM) |
| GET | `/reports/unpaid` | `billing.view` | AR report |
| GET | `/reports/vat` | `billing.view` | Query: `from`, `to` |
| GET | `/reports/cancelled-refunded` | `billing.view` | Query: `from`, `to` |
| GET | `/reports/by-service` | `billing.view` | Revenue by service |
| GET | `/reports/by-customer` | `billing.view` | Revenue by customer |
| GET | `/reports/collections` | `billing.view` | Query: `date` |
| GET | `/reports/ar-aging` | `billing.view` | Aging buckets |
| GET | `/reports/revenue` | `billing.view` | Query: `from`, `to` |
| GET | `/reports/journal` | `billing.view` | Query: `limit` |
| GET | `/invoice-settings` | `billing.view` | Invoice template JSON |
| PUT | `/invoice-settings` | `billing.create` | Update template |
| POST | `/invoice-settings/preview` | `billing.view` | Preview invoice PDF |
| GET | `/customers/:customerId/statement` | `billing.view` | Customer statement |
| GET | `/quotes` | `billing.view` | Paginated quotes |
| POST | `/quotes` | `billing.create` | Body: `quoteSchema` |
| GET | `/quotes/:id` | `billing.view` | Quote detail |
| GET | `/quotes/:id/pdf` | `billing.view` | Query: `regenerate=1` |
| GET | `/invoices` | `billing.view` | Paginated invoices |
| GET | `/invoices/:id` | `billing.view` | Invoice detail |
| GET | `/invoices/:id/pdf` | `billing.view` | Query: `regenerate=1` |
| POST | `/invoices/:id/cancel` | `billing.cancel` | Body: `{ "reason": "..." }` |
| GET | `/packages` | `billing.view` | Active packages |
| GET | `/extra-services` | `billing.view` **or** `billing.create` **or** `price_list.view` | Field visit extras (static list) |
| POST | `/invoices` | `billing.create` | Body: `invoiceSchema` |
| POST | `/payments` | `billing.payment` | Body: `paymentSchema` |
| POST | `/refunds` | `billing.refund` | Body: payment/invoice refund payload |

### 6.10 Inventory `/api/inventory`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/` | `inventory.view` | Paginated |
| GET | `/alerts` | `inventory.view` | Low stock + expiry |
| GET | `/:id` | `inventory.view` | Item + transactions |
| POST | `/` | `inventory.manage` | Body: `inventorySchema` |
| PUT | `/:id` | `inventory.manage` | Update item |
| POST | `/:id/adjust` | `inventory.manage` | Body: `{ "type", "quantity", "notes" }` |

### 6.11 Quality `/api/quality`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/qc` | `quality.view` |
| POST | `/qc` | `quality.manage` |
| GET | `/maintenance` | `quality.view` |
| POST | `/maintenance` | `quality.manage` |
| GET | `/calibrations` | `quality.view` |
| POST | `/calibrations` | `quality.manage` |
| GET | `/temperature` | `quality.view` |
| POST | `/temperature` | `quality.manage` |

### 6.12 Dashboard `/api/dashboard`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/stats` | `dashboard.view` | Admin stats if `dashboard.admin` or role `admin`; else technician dashboard. Response includes `mode`: `admin` \| `operations` |

### 6.13 Users (admin only) `/api/users`

Requires **`admin` role** for all routes.

| Method | Path | Notes |
|--------|------|-------|
| GET | `/permissions` | All permission codes |
| GET | `/roles` | All roles |
| GET | `/roles/:roleId/permissions` | Permissions for role |
| PUT | `/roles/:roleId/permissions` | Body: `{ "permissions": ["code", ...] }` |
| GET | `/` | Paginated users |
| POST | `/` | Body: `registerSchema` — create user |
| POST | `/purge-demo` | Remove demo accounts |
| PUT | `/:id` | Update user |
| DELETE | `/:id` | Deactivate user |

### 6.14 Audit `/api/audit`

| Method | Path | Permission | Query |
|--------|------|------------|-------|
| GET | `/` | `audit.view` | `page`, `limit`, `module`, `user_id` |

### 6.15 Notifications `/api/notifications`

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/channels` | `reports.view` | Enabled SMS/email channels |
| GET | `/` | `settings.view` | Notification queue list |
| POST | `/queue` | `settings.manage` | Queue manual notification |
| POST | `/send-report/:sampleId` | `notifications.send_report` **or** `reports.generate` | Body: `{ "channel": "sms", "recipient": "..." }` |

### 6.16 Settings `/api/settings`

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/public` | None | — |
| GET | `/` | Staff JWT | `settings.view` |
| PUT | `/:key` | Staff JWT | `settings.manage` — body: `{ "value": { ... } }` |

---

## 7. Portal API `/api/portal`

OTP routes are **unauthenticated**. All others require portal customer JWT.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/request-otp` | Send OTP to mobile |
| POST | `/auth/verify-otp` | Returns `{ accessToken, customer }` |
| GET | `/me` | Current customer profile |
| GET | `/dashboard` | Portal home summary |
| GET | `/search` | Query: `q` — search reports/animals |
| GET | `/documents` | PDFs + attachments for customer |
| GET | `/reports` | Paginated reports |
| GET | `/reports/:id/preview` | Sanitized report DTO (same shape as staff preview) |
| GET | `/reports/download/:filename` | Stream report PDF (ownership check) |
| GET | `/animals` | Customer's animals |
| GET | `/animals/:animalId/dashboard` | Per-animal summary |
| GET | `/animals/:animalId/trends/:parameterCode` | Query: `limit` |
| GET | `/animals/:animalId/compare` | Query: `reportIds=id1,id2` |
| GET | `/invoices` | Paginated invoices |
| GET | `/invoices/:id/pdf` | Invoice PDF stream |

---

## 8. Key request bodies

### Sample registration

```json
{
  "customer_id": "uuid",
  "animal_id": "uuid",
  "test_ids": ["uuid"],
  "package_ids": [],
  "invoice_id": null,
  "department": "Hematology",
  "priority": "normal",
  "notes": ""
}
```

### Result entry

```json
{
  "sample_test_id": "uuid",
  "values": [
    { "parameter_id": "uuid", "value": "12.5", "notes": null }
  ],
  "technician_notes": ""
}
```

### Report generation

```json
{
  "language": "ar",
  "treatment_recommendations": "Optional vet notes",
  "approve_lab": true,
  "approve_vet": false
}
```

### Device ingest (bridge)

```json
{
  "message": "MSH|^~\\&|NORMA|..."
}
```

---

## 9. Pagination & list queries

Most list endpoints accept:

| Query | Default | Max |
|-------|---------|-----|
| `page` | 1 | — |
| `limit` | 20 | varies (often 100–500 for admin lists) |
| `search` | — | text filter where supported |

---

## 10. File uploads

| Endpoint | Field | Max size | Types |
|----------|-------|----------|-------|
| `POST /animals/:id/image` | `image` | 5 MB | Image |
| `POST /results/sample-test/:id/attachments` | `image` or `file` | 20 MB | JPEG, PNG, WEBP, HEIC, etc. |

Stored under `/uploads/` (local) or S3 when configured.

---

## 11. PDF & binary responses

These endpoints stream files instead of JSON:

| Path | Content |
|------|---------|
| `GET /reports/download/:filename` | Report PDF |
| `GET /billing/invoices/:id/pdf` | Invoice PDF |
| `GET /billing/quotes/:id/pdf` | Quote PDF |
| `GET /billing/daily-closing/:id/pdf` | Daily closing PDF |
| `POST /billing/invoice-settings/preview` | Invoice preview PDF |
| `GET /billing/invoices/export/csv` | CSV |
| `GET /portal/reports/download/:filename` | Report PDF (portal auth) |
| `GET /portal/invoices/:id/pdf` | Invoice PDF (portal auth) |

---

## 12. Disabled & dev-only endpoints

| Endpoint | Status |
|----------|--------|
| `POST /devices/reference-ranges/sync` | **410 Gone** — use manual CRUD or LIMS `/reference-ranges` |
| `GET /reports/:id/preview-dev` | Non-production only |
| `GET /api/docs` | Hidden in production unless `SERVE_API_DOCS=true` |

---

## 13. Endpoint count summary

| Module | Routes |
|--------|-------:|
| Auth | 6 |
| Public | 2 |
| Health | 1 |
| Customers | 5 |
| Animals | 7 |
| Samples | 8 |
| Tests | 22 |
| Reference ranges (LIMS admin) | 5 |
| Results | 11 |
| Reports | 8 |
| Devices | 16 |
| Billing | 34 |
| Inventory | 6 |
| Quality | 8 |
| Dashboard | 1 |
| Users | 9 |
| Audit | 1 |
| Notifications | 4 |
| Settings | 3 |
| Portal | 15 |
| **Total** | **~172** |

---

## 14. Integration examples

### Staff: login → scan → preview report

```bash
# 1. Login
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"..."}' \
  | jq -r '.data.accessToken' > /tmp/token.txt

TOKEN=$(cat /tmp/token.txt)

# 2. Scan barcode
curl -s http://localhost:5000/api/samples/scan/SMP-260702-001 \
  -H "Authorization: Bearer $TOKEN"

# 3. Preview report
curl -s http://localhost:5000/api/reports/<report-uuid>/preview \
  -H "Authorization: Bearer $TOKEN"
```

### Bridge: Norma ingest

```bash
curl -X POST "http://localhost:5000/api/devices/<device-uuid>/ingest/<device-uuid>" \
  -H "X-Device-Key: <api_key>" \
  -H "Content-Type: application/json" \
  -d '{"message":"MSH|..."}'
```

### Portal: OTP login

```bash
curl -X POST http://localhost:5000/api/portal/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"966501234567"}'

curl -X POST http://localhost:5000/api/portal/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"966501234567","otp":"1234"}'
```

---

## 15. Permissions reference

Full catalog (41 permissions):

| Module | Codes |
|--------|-------|
| Dashboard | `dashboard.view`, `dashboard.admin` |
| Users | `users.view`, `users.create`, `users.update`, `users.delete` |
| Customers | `customers.view`, `customers.create`, `customers.update`, `customers.delete` |
| Animals | `animals.view`, `animals.create`, `animals.update`, `animals.delete` |
| Samples | `samples.view`, `samples.create`, `samples.update`, `samples.delete`, `samples.assign` |
| Tests | `tests.view`, `tests.manage`, `price_list.view` |
| Results | `results.view`, `results.enter`, `results.edit`, `results.validate`, `results.unvalidate`, `results.upload_images` |
| Reports | `reports.view`, `reports.generate` |
| Notifications | `notifications.send_report` |
| Billing | `billing.view`, `billing.create`, `billing.payment`, `billing.refund`, `billing.cancel`, `billing.day_close`, `billing.day_reopen` |
| Inventory | `inventory.view`, `inventory.manage` |
| Quality | `quality.view`, `quality.manage` |
| Settings | `settings.view`, `settings.manage` |
| Audit | `audit.view` |
| Devices | `devices.view`, `devices.manage` |
| Reference ranges | `reference_ranges.manage` |

**Default role highlights:**

| Role | Notable access |
|------|----------------|
| `admin` | All permissions |
| `manager` | Full lab ops + billing + devices + ref admin |
| `reception` | Registration, samples, billing create, report send |
| `lab_technician` | Enter results, upload images, QC |
| `lab_specialist` | Validate, generate reports |
| `veterinarian` | Validate, reports, ref admin |
| `accountant` | Billing, AR, day close |

---

## 16. Related files

| File | Purpose |
|------|---------|
| `backend/src/routes/index.js` | Route mounting |
| `backend/src/validators/schemas.js` | Joi request validation |
| `backend/src/utils/permissions.js` | Permission + role matrix |
| `backend/src/middleware/auth.js` | JWT + authorize |
| `backend/src/middleware/deviceAuth.js` | Device API key |
| `backend/src/middleware/customerAuth.js` | Portal JWT |
| `backend/API.md` | Shorter legacy doc (partially outdated) |

---

## 17. Changelog vs `backend/API.md`

| Addition | Notes |
|----------|-------|
| `/reference-ranges/*` | LIMS admin CRUD |
| `/animals/:id/trends` | Staff trends |
| `/results/*` attachments + unvalidate + approve-batch | Paras/microscopy |
| `/tests` categories/packages CRUD | Full catalog admin |
| `/tests/parameters/ranges` PUT/DELETE | Edit ref in Tests page |
| `/devices/reference-ranges/*` manual CRUD | Sync returns 410 |
| `/devices/ref-debug/*` | Norma debug |
| `/devices/ingest/*` | Bridge path |
| `/billing/*` expanded | Accounting, closings, quotes, reports |
| `/portal/*` | Full customer portal API |
| `/public/*` | Marketing catalog |
| `/users` admin-only | Not permission-gated |
| Login field | `username` not `email` in schema |

---

*End of API_DOCUMENTATION — regenerate after route changes.*
