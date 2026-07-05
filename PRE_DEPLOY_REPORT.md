# PRE-DEPLOY REPORT — Rare Vet LIMS

**Branch under review:** `release/v1-uat`  
**HEAD:** `998c8d7` (includes `b831aad` — LIMS v1 release candidate)  
**Production (`origin/main`):** `46165ff` — *Show numeric LIMS range when notes are generic sync labels*  
**Delta:** 2 commits · 105 files · +14,953 / −438 lines (doc commit adds UAT plan only)  
**Check date:** 2026-07-03  
**Checker:** Automated pre-production audit (no code changes)

---

## Verdict

# ❌ Not Ready — for production deploy to `main` / Render today

**Staff LIMS on current production:** ✅ Healthy (API, DB, S3, frontends — verified separately).

**`release/v1-uat` → production:** ❌ **Not Ready** until staging deploy + UAT sign-off + operational gates below.

| Gate | Status |
|------|--------|
| Verify scripts (local) | ✅ All pass |
| TODO / FIXME blockers in code | ✅ None found |
| Feature flags block core staff flow | ✅ None (workflow off by design) |
| Migrations | ⚠️ Auto-run on boot — compatible but has side effects |
| Render env (blueprint) | ⚠️ Incomplete for portal SMS; dashboard must be verified |
| UAT sign-off | ❌ Not completed (225 cases) |
| Staging deploy test | ❌ Not done |
| Manual pre-deploy backup | ❌ Not confirmed in this check |

---

## 1. Branch summary (`release/v1-uat`)

| Commit | Description |
|--------|-------------|
| `b831aad` | LIMS v1 RC: core engines (Phases 1–7), Phase 9A security, docs |
| `998c8d7` | UAT execution plan (docs only) |

**Key new runtime components (not on production today):**

- Engines: `reference-range`, `device-mapping`, `result`, `report-builder`, `barcode`, `portal-sync`, `laboratory-workflow`
- Security: login rate limit, device API key hashing, forgot-password fix, upload backup script
- Routes/UI: `reference-ranges.routes.js`, `ReferenceRanges.jsx`, `AnimalTrends.jsx`
- PDF: `pdf-template.js`, `pdf-i18n.js`

---

## 2. Verify scripts — results (local, `release/v1-uat`)

All executed from `backend/` on 2026-07-03:

| Script | Result |
|--------|--------|
| `verify-reference-range-engine.js` | ✅ 9/9 |
| `verify-device-mapping-engine.js` | ✅ 15/15 |
| `verify-result-engine.js` | ✅ 13/13 |
| `verify-report-builder.js` | ✅ 12/12 |
| `verify-report-preview-pdf-consistency.js` | ✅ Pass (pipeline aligned) |
| `verify-barcode-engine.js` | ✅ 15/15 |
| `verify-barcode-norma-chain.js` | ✅ 15/15 |
| `verify-portal-sync.js` | ✅ 15/15 |
| `verify-laboratory-workflow.js` | ✅ 36/36 |
| `verify-security-phase9.js` | ✅ 20/20 |

**Total:** 150/150 automated checks passed locally.

> ⚠️ These scripts do **not** replace UAT on staging with real Norma/Zebra/SMS hardware.

---

## 3. Migrations

### Is there a migration?

**Yes — but not versioned SQL files.** Schema is managed by:

1. `backend/migrations/init.sql` — full schema (only if DB empty)
2. `backend/src/scripts/migrate.js` — **idempotent patches** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

### Runs automatically on deploy?

**Yes.** `cloud-start.js` runs `migrate.js` on every boot (after HTTP server starts).

### Pending unapplied migration?

**No separate pending migration queue.** On deploy, `migrate.js` will apply any patches not yet applied to the live DB.

### ⚠️ Side effects on every deploy (migrate.js)

| Effect | Impact |
|--------|--------|
| `syncLabContactInfo()` | Updates lab phone/VAT/email in settings |
| **`UPDATE invoices SET pdf_url = NULL`** | All invoice PDFs regenerate on next request |
| **`UPDATE price_quotes SET pdf_url = NULL`** | Same for quotes |
| `seedNormaCbcMappings()` | Seeds/updates Norma parameter mappings |
| `ensureUniqueLimsReferenceRanges()` | Dedupes reference ranges |

### Database compatibility

| Check | Result |
|-------|--------|
| Existing production DB (`rare-vet-db`) | ✅ Compatible — patches are additive |
| Fresh DB | ✅ `init.sql` + patches |
| Breaking schema removal | ✅ None detected |
| Manual migration before deploy | ❌ **Not required** (auto on boot) |

---

## 4. TODO / blockers in code

| Scan | Result |
|------|--------|
| `TODO`, `FIXME`, `HACK`, `BLOCKER` in `backend/src`, `frontend/src` | ✅ **None found** |

No code TODO prevents runtime startup.

---

## 5. Feature flags

| Variable | Default / render.yaml | Blocks system? |
|----------|----------------------|----------------|
| `WORKFLOW_ENGINE_ENABLED` | `false` (not in yaml → false) | ❌ No — overlay disabled; legacy flow works |
| `PORTAL_OTP_STATIC` | `off` | ⚠️ Portal OTP **requires** `SMS_ENABLED=true` + Msegat |
| `SMS_ENABLED` | `false` in render.yaml | ⚠️ **Portal login blocked** unless SMS configured on Render dashboard |
| `PORTAL_SHOW_REVIEWED` | not set → false | ❌ No |
| `RUN_SEED` | `false` | ❌ No (correct for prod) |
| `UPLOAD_BACKUP_ENABLED` | `true` | ❌ No — optional cron |
| `SERVE_API_DOCS` | not set | ❌ No — Swagger off in prod |

**Conclusion:** No flag blocks **staff** reception/lab/report flow. **Portal OTP** is operationally blocked unless Msegat is live on Render (production may already override yaml — **verify dashboard**).

---

## 6. Missing files

| Asset | Status |
|-------|--------|
| `backend/migrations/init.sql` | ✅ Present |
| Report designs 1/2/3 | ✅ Present |
| Engine services (7) | ✅ Present |
| `pdf-template.js`, `pdf-i18n.js` | ✅ Present |
| `build:cloud` staff + portal dist | ✅ Built successfully locally |
| `build:cloud` backend `npm ci` | ⚠️ Windows EPERM on sharp (local env lock — **not a code gap**; Render Linux builds normally) |

No missing source file detected for deploy.

---

## 7. Environment variables

### Required — Core (must be set on Render)

| Variable | render.yaml | Notes |
|----------|-------------|-------|
| `NODE_ENV` | `production` | ✅ |
| `NODE_VERSION` | `20` | ✅ |
| `DATABASE_URL` | linked to `rare-vet-db` | ✅ |
| `JWT_SECRET` | generateValue | ✅ Must not be default |
| `SERVE_FRONTEND` | `true` | ✅ |
| `RUN_SEED` | `false` | ✅ Critical — never `true` in prod |

### Required — URLs & CORS

| Variable | render.yaml value |
|----------|-------------------|
| `APP_URL` | `https://lims.rarevetcare.com` |
| `STAFF_APP_URL` | `https://lims.rarevetcare.com` |
| `PORTAL_APP_URL` | `https://portal.rarevetcare.com` |
| `PORTAL_HOSTS` | `portal.rarevetcare.com` |
| `CORS_ORIGINS` | lims + portal + onrender.com |

### Required — Storage

| Variable | render.yaml | Production reality |
|----------|-------------|-------------------|
| `STORAGE_TYPE` | `local` | ⚠️ Live health shows **`s3`** — dashboard overrides yaml |
| `STORAGE_PATH` | `/var/data/uploads` | ✅ |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | sync: false | ⚠️ **Must verify on dashboard** if S3 in use |

### Required — Lab branding

| Variable | Set in yaml |
|----------|-------------|
| `LAB_NAME`, `LAB_NAME_AR` | ✅ |
| `LAB_PHONE`, `LAB_EMAIL` | ✅ |
| `VAT_NUMBER` | ✅ |
| `REPORT_DESIGN` | `3` | ✅ |

### Portal & notifications (pre-deploy verify)

| Variable | render.yaml | Required for go-live? |
|----------|-------------|----------------------|
| `PORTAL_OTP_STATIC` | `off` | ✅ Correct |
| `SMS_ENABLED` | `false` | ⚠️ Must be `true` for portal OTP |
| `MSEGAT_USERNAME` | sync: false | ⚠️ Required if SMS on |
| `MSEGAT_API_KEY` | sync: false | ⚠️ Required if SMS on |
| `MSEGAT_SENDER` | sync: false | ⚠️ Required if SMS on |

### Security (Phase 9A)

| Variable | render.yaml | Code default |
|----------|-------------|--------------|
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | `false` | `true` unless env `false` — yaml matches Render CA workaround |

### Optional / feature flags

| Variable | Recommended at first deploy |
|----------|----------------------------|
| `WORKFLOW_ENGINE_ENABLED` | `false` |
| `UPLOAD_BACKUP_ENABLED` | `true` (cron may not reach disk — see risks) |
| `EMAIL_ENABLED` | `false` |
| `WHATSAPP_ENABLED` | `false` |

### Not in render.yaml (verify dashboard)

- `WORKFLOW_ENGINE_ENABLED`
- `PORTAL_SHOW_REVIEWED`
- `SERVE_API_DOCS`
- `ADMIN_INITIAL_PASSWORD` (sync: false — must be set once)

---

## 8. Scripts before deploy

| Script | When | Required? |
|--------|------|-----------|
| **Manual DB backup** | Before merge/deploy | ✅ **Mandatory** |
| **Uploads backup** (S3 sync or tarball) | Before deploy | ✅ Recommended |
| `migrate.js` | Auto on boot | ✅ Do not run manually on prod unless emergency |
| `seed.js` | Never on prod | ❌ `RUN_SEED=false` |
| Verify scripts (`verify-*.js`) | After staging deploy | ✅ Recommended |
| `sync-norma-references.js` | Auto on boot via cloud-start | ⚠️ Runs automatically — monitor ref ranges |
| Regenerate Norma device API key | Only if planned | ⚠️ Requires `bridge.env` update on lab PC |
| `clear-device-reference-ranges.js` | Never before prod deploy | ❌ |

---

## 9. Risks

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | **No UAT sign-off** — 225 cases not executed on staging | **Critical** | Complete UAT on staging first |
| 2 | **105-file delta** untested against live DB | **Critical** | Staging deploy + smoke test |
| 3 | **Norma API key hashing** — legacy keys work until regenerate; new ingest path changed | **High** | Do not regenerate on deploy day; test CBC after staging |
| 4 | **migrate wipes invoice/quote `pdf_url`** | **Medium** | Expect PDF regen load; backup first |
| 5 | **Boot race** — HTTP up before migrate finishes | **Medium** | Watch boot logs; retry health after 2 min |
| 6 | **Portal OTP** — `SMS_ENABLED=false` in yaml | **High** | Confirm Msegat on Render dashboard |
| 7 | **Login rate limit** 5/15min (new in RC) | **Medium** | Train reception; avoid shared failed logins |
| 8 | **Upload backup cron** cannot read web service disk on Render | **Medium** | Rely on S3 versioning / manual backup |
| 9 | **Zebra bridge local** — unchanged but label code changed in RC | **High** | Test print on staging/reception before prod |
| 10 | **Production lab open today** | **Critical** | Do not deploy during active patient hours |

---

## 10. Deploy steps (ordered)

> **Do not execute until verdict = Ready and lab agrees maintenance window.**

### Phase A — Pre-deploy (T−60 min)

1. Announce maintenance window (staff + lab).
2. Confirm Render cron DB backup ran within 24h **or** run manual `pg_dump`.
3. Backup uploads (S3 versioning snapshot or tarball).
4. Record rollback SHA: **`46165ff`** (current production).
5. Export Render env vars screenshot / copy.
6. Verify Norma `bridge.env` — **do not regenerate key** unless tested on staging.
7. Run all verify scripts on **staging** after staging deploy.

### Phase B — Deploy staging first (recommended)

1. Create Render **preview/staging** service from `release/v1-uat` **OR** temporary branch deploy.
2. Link copy of DB (sanitized) or staging DB.
3. `build:cloud` → `start:cloud`.
4. Monitor boot log: migrate → sync scripts → ensure-admin.
5. Smoke: login → customer → sample → Norma → report → portal.
6. UAT critical path sign-off.

### Phase C — Production deploy (only after staging OK)

1. Merge `release/v1-uat` → `main` (PR reviewed).
2. `git push origin main` — triggers Render auto-deploy.
3. Monitor build log (staff + portal + backend native deps).
4. Monitor boot log for migrate errors.
5. `GET /api/health` → `database: ok`, frontends true.
6. Post-deploy smoke (15 min):
   - Staff login
   - Create test sample (or use test patient)
   - Norma CBC import
   - Report approve + PDF
   - Portal view (if SMS on)
7. Update `GO_LIVE_CHECKLIST.md` sign-off.

---

## 11. Rollback steps

### If deploy fails at build

1. Cancel deploy on Render.
2. Production unchanged — no rollback needed.

### If deploy succeeds but app broken (DB OK)

1. Render Dashboard → **rare-vet-lims** → Deploys → **Rollback** to `46165ff` deploy.
2. Verify `/api/health`.
3. Smoke: login + sample list + Norma test.
4. Log incident in `BUG_TRACKER.md`.

### If migration corrupted data

1. **Stop** new sample registration.
2. Restore DB from pre-deploy backup (Render snapshot or `pg_dump`).
3. Restore uploads if needed (S3 versioning / tarball).
4. Rollback app to `46165ff`.
5. Run health + full smoke before reopening.

### Norma bridge after rollback

- If API key was **not** regenerated: bridge continues working.
- If key was regenerated during failed deploy: revert `bridge.env` to previous key **or** re-enter key from LIMS Devices page.

**Reference:** [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)

---

## 12. Checklist summary

| Item | Pass? |
|------|-------|
| Verify scripts | ✅ |
| No blocking TODOs | ✅ |
| Feature flags don't block staff | ✅ |
| Portal SMS env verified | ⚠️ Manual dashboard check required |
| Migrations compatible | ✅ (with side effects) |
| No missing files | ✅ |
| UAT complete | ❌ |
| Staging deploy tested | ❌ |
| Pre-deploy backup | ❌ |
| Safe maintenance window | ❌ (lab operating today) |

---

## 13. Recommendation

| Action | Decision |
|--------|----------|
| Deploy `release/v1-uat` to production **today** | ❌ **No** |
| Continue operating current production (`46165ff`) | ✅ **Yes** |
| Next step | Staging deploy from `release/v1-uat` → 5-day UAT → then merge to `main` |

---

*Related: [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md), [GO_LIVE_CHECKLIST.md](./GO_LIVE_CHECKLIST.md), [UAT_EXECUTION_PLAN.md](./UAT_EXECUTION_PLAN.md), [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md)*
