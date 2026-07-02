# Release V1 Checklist — Rare Vet LIMS

**Product:** Rare Vet LIMS v1.0  
**Laboratory:** AL NAWADER VETERINARY CARE CENTER  
**Date:** 2026-07-03  
**Purpose:** Complete go-live checklist for first production release

Mark each section **GO / NO-GO / N/A**. All **GO** required for V1 sign-off.

---

## 1. Database

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1.1 | PostgreSQL provisioned (Render `rare-vet-db`) | ☐ | |
| 1.2 | Connection string secured (not in git) | ☐ | |
| 1.3 | SSL to database enabled and verified | ☐ | Fix `rejectUnauthorized: false` |
| 1.4 | Daily automated backup active | ☐ | Render cron 03:00 UTC |
| 1.5 | Manual backup tested (restore to staging) | ☐ | |
| 1.6 | Missing FK indexes added | ☐ | sample_tests, results, reports, device_messages |
| 1.7 | Seed data not in production (`RUN_SEED=false`) | ☐ | |
| 1.8 | Admin user exists and password rotated | ☐ | |
| 1.9 | Demo users purged (`purge-demo` if needed) | ☐ | |
| 1.10 | Reference ranges populated for main species | ☐ | Camel, horse, etc. |
| 1.11 | Device parameter mappings for Norma CBC | ☐ | Phase 2 verified |
| 1.12 | Test catalog complete (CBC, Chem, Parasitology) | ☐ | |

---

## 2. API (Backend)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 2.1 | Health endpoint returns 200 | ☐ | `/api/health` |
| 2.2 | All verify scripts pass (Phase 1–7) | ☐ | 36+ tests total |
| 2.3 | JWT secret not default in production | ☐ | |
| 2.4 | Password reset does NOT return token in JSON | ☐ | **SEC-01 blocker** |
| 2.5 | Login rate limiting enabled | ☐ | **SEC-04 blocker** |
| 2.6 | Global rate limit active (500/15min) | ☐ | |
| 2.7 | CORS restricted to lab domains | ☐ | |
| 2.8 | Helmet security headers active | ☐ | |
| 2.9 | Error responses hide stack traces in prod | ☐ | |
| 2.10 | Unhandled rejection handler registered | ☐ | |
| 2.11 | Migrations run before traffic (or acceptable race) | ☐ | cloud-start.js |
| 2.12 | API docs disabled in production | ☐ | |
| 2.13 | Audit logging on critical mutations | ☐ | Partial today |

---

## 3. Frontend (Staff)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3.1 | Built with `VITE_API_URL=/api` | ☐ | build-cloud.js |
| 3.2 | Login/logout flow works | ☐ | |
| 3.3 | Permission-based navigation correct per role | ☐ | reception, tech, doctor, manager |
| 3.4 | Arabic/English switching works | ☐ | |
| 3.5 | Reception workflow (WorkflowCase) end-to-end | ☐ | |
| 3.6 | Sample list, scan, status update | ☐ | |
| 3.7 | Results entry and validation UI | ☐ | |
| 3.8 | Report view and approval UI | ☐ | |
| 3.9 | Billing and invoice UI | ☐ | |
| 3.10 | Dashboard loads for admin | ☐ | |
| 3.11 | No console errors on critical paths | ☐ | |
| 3.12 | Dockerfile build uses correct API URL | ☐ | Default localhost issue |

---

## 4. Customer Portal

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4.1 | Portal domain live (`portal.rarevetcare.com`) | ☐ | |
| 4.2 | SMS OTP delivery works (Msegat) | ☐ | SMS_ENABLED=true |
| 4.3 | Static OTP disabled (`PORTAL_OTP_STATIC=off`) | ☐ | |
| 4.4 | No `debugOtp` in production API response | ☐ | |
| 4.5 | Customer sees only published reports | ☐ | portal-sync Phase 6 |
| 4.6 | Portal PDF = official `pdf_url` | ☐ | |
| 4.7 | Portal sections match staff preview | ☐ | |
| 4.8 | Mobile layout acceptable | ☐ | |
| 4.9 | Logout clears session | ☐ | |

---

## 5. Reports

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5.1 | Report Design 3 active (`REPORT_DESIGN=3`) | ☐ | render.yaml |
| 5.2 | Dynamic sections (CBC/Chem/Parasites only when ordered) | ☐ | Phase 4 |
| 5.3 | Preview = PDF = Portal (sections signature match) | ☐ | Phase 4.1 |
| 5.4 | Reference ranges from Reference Range Engine | ☐ | Phase 1 |
| 5.5 | Flags from Result Engine (HIGH/LOW/NORMAL) | ☐ | Phase 3 |
| 5.6 | Arabic text renders correctly in PDF | ☐ | |
| 5.7 | Approval signatures appear when approved | ☐ | |
| 5.8 | Public verification page works | ☐ | `/verify/:code` |
| 5.9 | PDF generation < 15s for typical CBC report | ☐ | Performance |

---

## 6. Devices (Norma)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6.1 | Device registered in admin with API key | ☐ | |
| 6.2 | API keys hashed at rest | ☐ | **SEC-02 blocker** |
| 6.3 | Norma bridge running on lab PC | ☐ | norma-listener.js |
| 6.4 | HL7 ingest endpoint reachable from lab | ☐ | HTTPS |
| 6.5 | Full CBC import maps all parameters | ☐ | Phase 2 |
| 6.6 | WBC ≠ LYM% (no mapping confusion) | ☐ | Verified |
| 6.7 | Sample ID in Norma PID matches LIMS barcode | ☐ | Phase 5 chain |
| 6.8 | Failed import shows clear error in device messages | ☐ | |
| 6.9 | Replay import works for failed messages | ☐ | |

---

## 7. Norma Reference Ranges

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7.1 | LIMS reference ranges authoritative (not auto-sync from Norma) | ☐ | Policy decision |
| 7.2 | Device reference ranges configured if needed | ☐ | |
| 7.3 | Species-specific ranges for main animals | ☐ | |

---

## 8. Barcode & Labels

| # | Item | Status | Notes |
|---|------|--------|-------|
| 8.1 | Sample ID = barcode digits only (Code128) | ☐ | Phase 5 |
| 8.2 | Arabic text outside barcode (ZPL ^CI28) | ☐ | |
| 8.3 | Zebra 50×25mm label prints correctly | ☐ | Physical test |
| 8.4 | Scanned barcode opens correct sample | ☐ | |
| 8.5 | Norma accepts scanned sample ID | ☐ | End-to-end |
| 8.6 | Zebra local bridge running on reception PC | ☐ | |
| 8.7 | Label copies setting respected | ☐ | |

---

## 9. Workflow Engine (Phase 7)

| # | Item | Status | Notes |
|---|------|--------|-------|
| 9.1 | `WORKFLOW_ENGINE_ENABLED` decision documented | ☐ | Default: false for V1 |
| 9.2 | If enabled: workflow summary on sample detail | ☐ | |
| 9.3 | If enabled: dashboard workflow counts | ☐ | |
| 9.4 | Transition rules enforced (no publish before approve) | ☐ | 36 tests pass |
| 9.5 | Timeline visible in workflow API | ☐ | |
| 9.6 | Legacy `workflow` object still present | ☐ | Backward compat |

---

## 10. Security

| # | Item | Status | Notes |
|---|------|--------|-------|
| 10.1 | SEC-01 fixed (no resetToken in response) | ☐ | **Blocker** |
| 10.2 | SEC-02 fixed (hashed device keys) | ☐ | **Blocker** |
| 10.3 | SEC-03 fixed (DB TLS verification) | ☐ | **Blocker** |
| 10.4 | SEC-04 fixed (login rate limit) | ☐ | **Blocker** |
| 10.5 | Protected upload paths verified | ☐ | |
| 10.6 | Portal OTP brute-force limited | ☐ | 10/15min ✅ |
| 10.7 | Staff roles assigned correctly (least privilege) | ☐ | |
| 10.8 | Debug endpoints disabled or restricted | ☐ | |
| 10.9 | Secrets not in git repository | ☐ | |
| 10.10 | Security audit reviewed (`SECURITY_AUDIT.md`) | ☐ | |

---

## 11. Backup & Recovery

| # | Item | Status | Notes |
|---|------|--------|-------|
| 11.1 | Daily DB backup automated | ☐ | |
| 11.2 | Uploads backup procedure documented and tested | ☐ | **Gap today** |
| 11.3 | Restore drill performed (DB + uploads) | ☐ | |
| 11.4 | Rollback procedure tested (Render previous deploy) | ☐ | |
| 11.5 | `BACKUP_AND_ROLLBACK.md` accessible to IT | ☐ | |
| 11.6 | Backup retention policy defined (7–30 days) | ☐ | |
| 11.7 | Off-site backup copy (download from Render cron) | ☐ | |

---

## 12. Deploy & Infrastructure

| # | Item | Status | Notes |
|---|------|--------|-------|
| 12.1 | Render web service configured per `render.yaml` | ☐ | |
| 12.2 | 5 GB disk mounted for uploads | ☐ | |
| 12.3 | Custom domains SSL active | ☐ | |
| 12.4 | `DEPLOYMENT_CHECKLIST.md` followed for last deploy | ☐ | |
| 12.5 | Build pipeline (`build:cloud`) succeeds | ☐ | |
| 12.6 | Boot scripts complete without fatal errors | ☐ | |
| 12.7 | Health check monitored (Render + optional GH Actions) | ☐ | |
| 12.8 | Log access configured (Render dashboard) | ☐ | |
| 12.9 | S3 storage evaluated (recommended over local disk) | ☐ | |

---

## 13. Training & Operations

| # | Item | Status | Notes |
|---|------|--------|-------|
| 13.1 | Reception staff trained on registration + labels | ☐ | |
| 13.2 | Lab technicians trained on results + Norma | ☐ | |
| 13.3 | Doctors trained on report approval | ☐ | |
| 13.4 | Manager trained on dashboard + users | ☐ | |
| 13.5 | IT contact for bridge/Norma issues identified | ☐ | |
| 13.6 | Support escalation path documented | ☐ | |
| 13.7 | `TESTING_CHECKLIST.md` available for regression | ☐ | |

---

## 14. Performance Baseline

| # | Item | Status | Notes |
|---|------|--------|-------|
| 14.1 | Sample list loads < 2s with 500 samples | ☐ | |
| 14.2 | Norma CBC import < 10s | ☐ | |
| 14.3 | PDF generation < 15s | ☐ | |
| 14.4 | Portal dashboard < 5s | ☐ | |
| 14.5 | No OOM crashes under normal lab load | ☐ | |

---

## V1 Go / No-Go Decision

### Blockers (must be GO)

| Blocker | Section |
|---------|---------|
| Password reset token leak fixed | 10.1 |
| Device API keys hashed | 10.2 |
| DB TLS verification | 10.3 |
| Login rate limiting | 10.4 |
| Uploads backup procedure | 11.2 |
| SMS OTP working for portal | 4.2 |
| Norma end-to-end tested | 6.5 |
| Barcode physical test | 8.3 |

### Current Assessment (2026-07-03)

**V1 Status: NO-GO** until security blockers (§10.1–10.4) and uploads backup (§11.2) resolved.

**Pilot Status: CONDITIONAL GO** — system can operate with documented risks and manual backup procedures.

---

## Sign-Off Board

| Role | GO / NO-GO | Name | Date |
|------|------------|------|------|
| Technical Lead | | | |
| Lab Director | | | |
| IT Operations | | | |
| Quality / Compliance | | | |

---

## Post-Release Monitoring (First 30 Days)

- [ ] Daily health check review
- [ ] Weekly backup verification
- [ ] Error log review (Render logs)
- [ ] User feedback collection from reception + lab
- [ ] Norma import success rate tracking
- [ ] Portal OTP delivery success rate
- [ ] PDF generation failure rate

---

*Related: `PRODUCTION_READINESS_REPORT.md`, `SECURITY_AUDIT.md`, `PERFORMANCE_AUDIT.md`, `DEPLOYMENT_CHECKLIST.md`*
