# Backup & Rollback — Rare Vet LIMS

> **Phase 0 — Safety Baseline**  
> **Rule:** No production migration without a verified backup ([CHANGE_CONTROL.md](./CHANGE_CONTROL.md))

---

## 1. What to backup

| Asset | Location (production) | Why |
|-------|----------------------|-----|
| **PostgreSQL** | Render `rare-vet-db` | All LIMS data |
| **Uploads** | `/var/data/uploads` (Render disk) or S3 bucket | Report PDFs, paras images, animal photos |
| **Env vars** | Render Dashboard → Environment | JWT, S3 keys, lab contact — export manually before major changes |
| **Git state** | GitHub `main` / deploy tag | Application rollback reference |

---

## 2. Database backup

### 2.1 Automated (Render — recommended)

| Mechanism | Schedule | Retention | Notes |
|-----------|----------|-----------|-------|
| Cron **`rare-vet-db-backup`** | Daily 03:00 UTC | 7 days (`BACKUP_RETENTION_DAYS`) | Defined in `render.yaml` |
| Render Dashboard → **rare-vet-db → Backups** | Plan-dependent | Per Render policy | Paid DB plans |

Cron runs `backend/Dockerfile.backup` → `npm run backup` with optional S3 upload (`BACKUP_S3_PREFIX=backups/db`).

**Verify cron:** Render Dashboard → **rare-vet-db-backup** → Logs (success after 03:00 UTC).

---

### 2.2 Manual — `pg_dump` (full SQL restore)

**Requires:** PostgreSQL client tools (`pg_dump`, `psql`) on your machine.

1. Render Dashboard → **rare-vet-db** → **Connect** → copy **External Database URL**
2. Set environment variable (PowerShell):

```powershell
$env:DATABASE_URL = "postgresql://user:pass@host/dbname"
cd backend
npm run backup
```

3. Output: `backend/backups/rare-vet-lims-YYYY-MM-DDTHH-MM-SS.sql` (gzip if available)

**Optional env:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `BACKUP_DIR` | `backend/backups` | Output folder |
| `BACKUP_RETENTION_DAYS` | `30` | Delete local files older than N days |
| `BACKUP_S3_PREFIX` | `backups/db` | S3 key prefix when S3 configured |

**Script:** `backend/src/scripts/backup-db.js`

---

### 2.3 Manual — JSON table dump (no `pg_dump`)

Use when PostgreSQL client is not installed:

```powershell
$env:DATABASE_URL = "postgresql://..."
cd backend
node src/scripts/backup-db-pg.js
```

Output: `backend/backups/rare-vet-lims-*-tables.json.gz`  
**Note:** JSON dump is for archival/inspection — prefer `pg_dump` for full restore.

---

### 2.4 Docker Compose (local)

```bash
docker exec rare-vet-lims-db pg_dump -U lims_user rare_vet_lims \
  | gzip > backups/lims_$(date +%Y%m%d).sql.gz
```

See also [DEPLOYMENT.md](./DEPLOYMENT.md) § Backup.

---

## 3. Uploads backup

### 3.1 Render persistent disk

Production mount (from `render.yaml`):

| Disk name | Mount path | Size |
|-----------|------------|------|
| `lims-uploads` | `/var/data` | 5 GB |
| App uploads | `/var/data/uploads` (`STORAGE_PATH`) | — |

**Before major deploy:**

1. Render Dashboard → **rare-vet-lims** → **Shell** (if available) or one-off job
2. Archive uploads:

```bash
tar -czf /tmp/uploads-backup-$(date +%Y%m%d).tar.gz -C /var/data uploads
```

3. Download the tarball or copy to S3 (if `aws cli` configured)

**Without shell access:** enable S3 storage (below) so files are off-disk.

---

### 3.2 S3 storage (recommended for PDF durability)

When set in Render Environment:

- `STORAGE_TYPE=s3` (or auto when `S3_BUCKET` + keys present)
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

**Backup approach:**

- Enable bucket versioning (provider-side), **or**
- Periodic sync: `aws s3 sync s3://BUCKET/uploads s3://BUCKET/backups/uploads/YYYY-MM-DD/`

DB backup cron can upload to the same bucket under `backups/db/`.

---

### 3.3 Local development

```powershell
Compress-Archive -Path backend\uploads -DestinationPath backups\uploads-local.zip
```

---

## 4. Database restore (rollback)

### 4.1 From `pg_dump` SQL file

**Warning:** `--clean --if-exists` in backup script drops objects — confirm URL points to **correct** database.

```powershell
$env:DATABASE_URL = "postgresql://..."
cd backend
gunzip -c backups/rare-vet-lims-2026-07-03T12-00-00.sql.gz | psql $env:DATABASE_URL
```

On Windows without gunzip, use 7-Zip to extract `.sql` then:

```powershell
psql $env:DATABASE_URL -f backups\rare-vet-lims-2026-07-03.sql
```

---

### 4.2 From Render dashboard backup

1. Dashboard → **rare-vet-db** → **Backups**
2. Select snapshot → **Restore** (creates new instance or overwrites per Render UI)
3. Update **`DATABASE_URL`** on web service if connection string changes
4. Redeploy web service

---

### 4.3 After restore

1. Run migrations only if restoring **older** DB onto **newer** code — test on staging first:

```bash
cd backend && npm run migrate
```

2. Run [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) §0–9 minimum  
3. Clear stale PDF cache if lab contact changed (migrate may null `pdf_url` on invoices/quotes)

---

## 5. Application rollback (code)

### 5.1 Render

1. Dashboard → **rare-vet-lims** → **Events** / **Deploys**
2. Select last known-good deploy → **Rollback to this version**
3. Do **not** rollback code alone if DB migration already ran forward — restore DB first or forward-fix

### 5.2 Git

```bash
git log --oneline -10
git revert <bad-commit-sha>   # preferred over reset on shared main
git push origin main
```

Render auto-deploys on push to `main` (per `render.yaml`).

---

## 6. Uploads rollback

| Scenario | Action |
|----------|--------|
| Restored DB but lost disk | Report `pdf_url` may 404 — regenerate PDFs from Reports UI |
| Have tarball backup | Extract to `/var/data/uploads` on disk |
| S3 with versioning | Restore previous object versions for prefix `uploads/` |

---

## 7. Rollback decision tree

```
Deploy caused issue?
├─ Data wrong / migration failed
│   1. Stop new traffic
│   2. Restore DB from backup (§4)
│   3. Restore uploads if needed (§6)
│   4. Rollback app deploy (§5)
│   5. Run TESTING_CHECKLIST
└─ UI/code only, DB OK
    1. Rollback app deploy (§5)
    2. Spot-check TESTING_CHECKLIST §8–9
```

---

## 8. Pre-change checklist (copy before every prod change)

| ☐ | Step |
|---|------|
| ☐ | Confirm `rare-vet-db-backup` last run succeeded (or run `npm run backup`) |
| ☐ | Note backup filename / Render snapshot ID in change log |
| ☐ | Export critical env vars screenshot or copy |
| ☐ | Uploads backed up (disk tar or S3 sync) if touching reports/images |
| ☐ | Know last good Render deploy ID for rollback |

---

## 9. Commands reference

| Task | Command |
|------|---------|
| DB backup (SQL) | `cd backend && npm run backup` |
| DB backup (JSON) | `cd backend && node src/scripts/backup-db-pg.js` |
| DB migrate | `cd backend && npm run migrate` |
| Health check | `curl https://lims.rarevetcare.com/api/health` |
| Restore SQL | `psql $DATABASE_URL -f backups/file.sql` |

---

## 10. Related docs

- [DEPLOYMENT.md](./DEPLOYMENT.md) — full production guide
- [DATABASE_DOCUMENTATION.md](./DATABASE_DOCUMENTATION.md) — schema reference
- [CHANGE_CONTROL.md](./CHANGE_CONTROL.md) — when backup is mandatory

---

*Phase 0 — operational procedures documented; no scripts or infrastructure were modified.*
