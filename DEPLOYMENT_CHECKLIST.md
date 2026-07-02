# Deployment Checklist — Rare Vet LIMS

**Target:** Render.com production (lims.rarevetcare.com + portal.rarevetcare.com)  
**Lab:** AL NAWADER VETERINARY CARE CENTER  
**Date:** 2026-07-03  
**Phase:** 8

Use this checklist for every production deployment. Check `[x]` only after verification.

---

## Pre-Deploy

### Code & Change Control

- [ ] All changes documented in `CHANGE_CONTROL.md`
- [ ] No unauthorized file deletions
- [ ] Phase verify scripts pass locally:
  ```bash
  cd backend
  node src/scripts/verify-reference-range-engine.js
  node src/scripts/verify-device-mapping-engine.js
  node src/scripts/verify-result-engine.js
  node src/scripts/verify-report-builder.js
  node src/scripts/verify-report-preview-pdf-consistency.js
  node src/scripts/verify-barcode-engine.js
  node src/scripts/verify-portal-sync.js
  node src/scripts/verify-laboratory-workflow.js
  ```
- [ ] Manual smoke test per `TESTING_CHECKLIST.md` §0–15 (at least critical path)
- [ ] Git branch merged to `main` and reviewed

### Backup (Mandatory before deploy)

- [ ] Database backup taken:
  ```bash
  pg_dump $DATABASE_URL > backup-pre-deploy-$(date +%Y%m%d).sql
  ```
  Or confirm Render cron backup ran within 24h
- [ ] Uploads backup taken (if using local disk):
  ```bash
  tar -czf uploads-backup-$(date +%Y%m%d).tar.gz /var/data/uploads
  ```
- [ ] Backup restore procedure reviewed (`BACKUP_AND_ROLLBACK.md`)
- [ ] Rollback commit hash recorded

---

## Render Environment Variables

### Required — Core

- [ ] `NODE_ENV=production`
- [ ] `NODE_VERSION=20`
- [ ] `DATABASE_URL` — linked to `rare-vet-db`
- [ ] `JWT_SECRET` — auto-generated, not default
- [ ] `SERVE_FRONTEND=true`
- [ ] `RUN_SEED=false`

### Required — URLs & CORS

- [ ] `APP_URL=https://lims.rarevetcare.com`
- [ ] `STAFF_APP_URL=https://lims.rarevetcare.com`
- [ ] `PORTAL_APP_URL=https://portal.rarevetcare.com`
- [ ] `CORS_ORIGINS` includes staff + portal domains
- [ ] `PORTAL_HOSTS` includes portal domain

### Required — Storage

- [ ] `STORAGE_TYPE=local` (current) OR `s3` (recommended for prod)
- [ ] `STORAGE_PATH=/var/data/uploads`
- [ ] Render disk mounted at `/var/data` (5 GB minimum)
- [ ] If S3: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` set and tested (`npm run test:s3`)

### Required — Admin

- [ ] `ADMIN_USERNAME` set
- [ ] `ADMIN_EMAIL` set
- [ ] `ADMIN_INITIAL_PASSWORD` set (sync: false, strong password)
- [ ] Admin login tested after deploy

### Required — Lab Branding

- [ ] `LAB_NAME`, `LAB_NAME_AR`
- [ ] `LAB_PHONE`, `LAB_EMAIL`
- [ ] `VAT_NUMBER`
- [ ] `REPORT_DESIGN=3` (or confirmed design number)

### Portal & Notifications

- [ ] `PORTAL_OTP_STATIC=off` (never static OTP in prod)
- [ ] `SMS_ENABLED=true` (for customer OTP)
- [ ] `MSEGAT_USERNAME`, `MSEGAT_API_KEY`, `MSEGAT_SENDER` configured
- [ ] Portal OTP login tested end-to-end
- [ ] `PORTAL_SHOW_REVIEWED=false` (unless intentionally enabled)

### Feature Flags

- [ ] `WORKFLOW_ENGINE_ENABLED=false` (enable only after pilot validation)
- [ ] `SERVE_API_DOCS=false` (no Swagger in prod)
- [ ] `WHATSAPP_ENABLED` / `EMAIL_ENABLED` as intended

### Device Integration

- [ ] Norma device registered in LIMS admin
- [ ] `DEVICE_ID` and `DEVICE_API_KEY` configured on lab bridge PC
- [ ] `bridge/bridge.env` points to `https://lims.rarevetcare.com/api`
- [ ] Norma listener running on lab PC (port 21110)
- [ ] Test CBC import after deploy

### Optional — Workflow

- [ ] `WORKFLOW_ENGINE_ENABLED=true` (only when ready)
- [ ] Workflow dashboard counts visible in admin dashboard

---

## Build & Deploy Steps

### 1. Trigger Deploy

- [ ] Push to `main` or manual deploy on Render dashboard
- [ ] Build command: `npm run build:cloud`
- [ ] Start command: `npm run start:cloud`

### 2. Monitor Build Log

- [ ] Frontend staff build succeeds (`VITE_API_URL=/api`)
- [ ] Frontend portal build succeeds
- [ ] Backend `npm ci` succeeds (canvas/sharp native deps)
- [ ] No build warnings that block functionality

### 3. Monitor Boot Log (`cloud-start.js`)

- [ ] Migrations complete without error
- [ ] Sync scripts complete (CBC params, device refs if enabled)
- [ ] `ensure-admin` succeeds
- [ ] No unexpected PDF URL wipe impact understood

### 4. Health Check

- [ ] `GET https://lims.rarevetcare.com/api/health` returns 200
- [ ] Response shows `database: ok`
- [ ] Response shows `storage: ok` (or `degraded` investigated)
- [ ] Response shows frontend dist present

---

## Post-Deploy Verification

### Staff Application

- [ ] Login at `https://lims.rarevetcare.com`
- [ ] Dashboard loads (admin mode)
- [ ] Create customer → animal → sample (reception flow)
- [ ] Print barcode label (Zebra bridge on reception PC)
- [ ] Sample appears in lab queue

### Laboratory

- [ ] Manual result entry works
- [ ] Norma CBC import works (full panel)
- [ ] Results show correct flags (HIGH/LOW/NORMAL)
- [ ] Parasitology image upload works

### Reports

- [ ] Report preview matches PDF (Design 3)
- [ ] Report approval (doctor/specialist)
- [ ] PDF download opens correctly
- [ ] Public verify link `/verify/:code` works

### Portal

- [ ] Login at `https://portal.rarevetcare.com`
- [ ] OTP received via SMS
- [ ] Published report visible
- [ ] PDF download from portal works
- [ ] Report sections match staff view

### Billing

- [ ] Invoice creation linked to sample
- [ ] Payment recording
- [ ] Invoice PDF generation

### Security Spot Checks

- [ ] Default JWT secret rejected (already in prod)
- [ ] `/api/docs` not accessible (unless intentionally enabled)
- [ ] Protected uploads require auth (`/uploads/reports/...`)
- [ ] Invalid login returns 401 without stack trace

---

## Lab Infrastructure (On-Premise)

### Reception PC

- [ ] Zebra bridge running (`tools/zebra-local-bridge.js` or bat script)
- [ ] Browser can reach `https://localhost:9443` (bridge)
- [ ] Label prints on physical Zebra (50×25mm)
- [ ] Barcode scans back into LIMS

### Norma / Lab PC

- [ ] `bridge/norma-listener.js` running as service
- [ ] Norma configured to send to lab PC IP:21110
- [ ] Firewall allows outbound HTTPS to Render

### Parasitology (if used)

- [ ] `tools/parasitology-agent` installed on microscope PC
- [ ] LAN upload to LIMS API tested

---

## Rollback Procedure

If deploy fails:

1. [ ] Render → rollback to previous deploy (instant)
2. [ ] If DB migration corrupted: restore from pre-deploy backup
3. [ ] If uploads affected: restore tarball to `/var/data/uploads`
4. [ ] Verify health endpoint
5. [ ] Notify lab staff

See `BACKUP_AND_ROLLBACK.md` for detailed steps.

---

## Cron Jobs

- [ ] Render cron `rare-vet-db-backup` active (03:00 UTC daily)
- [ ] GitHub Actions `db-backup.yml` configured (optional, needs `DATABASE_URL` secret)
- [ ] Backup retention policy confirmed (`BACKUP_RETENTION_DAYS`)

---

## DNS & SSL

- [ ] `lims.rarevetcare.com` → Render web service
- [ ] `portal.rarevetcare.com` → same Render web service
- [ ] SSL certificates active (Render managed)
- [ ] No mixed content warnings in browser console

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Lab Manager | | | |
| IT / Deploy | | | |

---

*Companion document: `RELEASE_V1_CHECKLIST.md` for full go-live criteria.*
