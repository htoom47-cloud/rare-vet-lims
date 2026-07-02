# Performance Audit — Rare Vet LIMS

**Date:** 2026-07-03  
**Phase:** 8 — Enterprise Audit  
**Scope:** Database queries, reports/PDF, portal, barcode, Norma import, memory/CPU  
**Method:** Static code review + architecture analysis  
**Code changes:** None

**Performance Score: 70 / 100**

---

## Summary

Performance is **adequate for a single-lab deployment** (tens to low hundreds of samples/day). Bottlenecks appear at **Norma device import** (N+1 parameter resolution), **portal dashboard** (multiple full report previews), **PDF generation** (Puppeteer/chromium), and **missing database indexes** on foreign keys. No evidence of caching layer (Redis) or query result memoization.

---

## Infrastructure Baseline (Render)

| Resource | Config | Implication |
|----------|--------|-------------|
| Web plan | Starter | Shared CPU; PDF spikes affect all requests |
| Database | basic-256mb | ~256 MB RAM; limited connections |
| Upload disk | 5 GB local | I/O bound for PDF/image storage |
| Region | Frankfurt | Latency OK for Saudi users (~100–150ms) |
| Single instance | No horizontal scale | No load balancing |

**Estimated capacity:** 50–200 concurrent staff users (light API); **2–5 simultaneous PDF generations** may cause latency spikes.

---

## Database Performance

### Query Patterns — Good

- Parameterized queries throughout.
- Dashboard aggregates use single SQL with COUNT/SUM (not N+1 in JS).
- Sample list uses correlated subqueries (efficient at moderate scale with indexes).

### Query Patterns — Concerns

| Pattern | Location | Impact | Severity |
|---------|----------|--------|------------|
| Per-test price SELECT in loop | `samples.service.js` ~170 | 1 query × N tests (typically 1–5) | Low |
| Correlated COUNT subqueries per sample row | `samples.service.js` list | 4–6 subqueries × page size | Medium at 1000+ samples |
| `metadata->>'sample_id'` JSONB filter | `samples.service.js`, workflow | Seq scan on notification_queue | Medium |
| LATERAL join for ref ranges | `reports.service.js` | Per result row; indexed param lookup | Acceptable |
| Portal attachment query bug | `portal.service.js` ~716 | Failed query (empty result, not slow) | Functional |

### Missing Indexes (Performance Impact)

Recommended additions (see DATABASE_DOCUMENTATION.md):

```sql
-- High priority
CREATE INDEX idx_sample_tests_sample_id ON sample_tests(sample_id);
CREATE INDEX idx_results_sample_test_id ON results(sample_test_id);
CREATE INDEX idx_reports_sample_id ON reports(sample_id);
CREATE INDEX idx_device_messages_sample_id ON device_messages(sample_id);
CREATE INDEX idx_invoices_sample_id ON invoices(sample_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_notification_queue_metadata ON notification_queue USING gin(metadata jsonb_path_ops);
```

**Estimated improvement:** 30–70% faster on sample detail, device replay, workflow timeline at scale.

### Transaction & Locking

| Operation | Transaction | Lock risk |
|-----------|-------------|-----------|
| Sample create | ✅ BEGIN/COMMIT | Low |
| Result entry | ✅ | Row-level on results |
| Device ingest | ❌ Multi-step | Partial state on failure |
| Billing + ledger | ⚠️ Split txn | Invoice without journal |
| migrate.js deploy | ❌ | DDL locks on deploy |

**Deploy note:** `migrate.js` runs ALTER/CREATE on every boot — brief table locks during deploy.

---

## Authentication Overhead

Every authenticated request executes **2 DB queries**:

1. Load user by ID
2. Load permissions for role

**Impact:** ~2–5ms per request at low load; adds up at high concurrency.

**Recommendation:** Cache permissions in JWT claims or in-memory TTL cache (5 min) — not implemented.

---

## PDF Generation

### Pipeline

1. `reports.service.js` → `buildReportData` → Report Builder sections
2. Puppeteer + `@sparticuz/chromium` (Render/Linux) or local Chrome
3. PDF stored to `/var/data/uploads/reports/` or S3

### Performance Characteristics

| Factor | Impact |
|--------|--------|
| Chromium launch | 1–3s cold start |
| Arabic font rendering | canvas + arabic-reshaper CPU |
| Report size (CBC + Chem + images) | 2–8s generation |
| Concurrent PDFs | Memory ~200–400 MB each |

### Concerns

1. **No PDF generation queue** — synchronous in request thread.
2. **PDF cache invalidation** — `migrate.js` `syncLabContactInfo()` clears ALL `invoices.pdf_url` and `price_quotes.pdf_url` on every deploy.
3. **Client-side fallback** (`labReportPrint.js`) — html2canvas rasterization; very slow on large reports.
4. **Design 3** default on Render — complex layout increases render time vs simple templates.

### Recommendations

- Background job queue for PDF (Bull/BullMQ + Redis) — P2.
- Cache generated PDF until report data changes — P1.
- Remove blanket PDF URL wipe from migrate deploy hook — P1.

---

## Portal Performance

### Dashboard Load

`portal.service.js` dashboard may call `reportsService.getPreview()` per animal (up to 12 animals):

- Each preview = full report build (sections, ref ranges, flags).
- **Potential:** 12 × 200ms–2s = 2–24s dashboard load.

### Report Comparison

`Promise.all` over multiple reports — each full preview. Acceptable for 2–3 reports; slow beyond.

### Mitigations (not implemented)

- Cache latest report summary per animal (materialized view or Redis).
- Lightweight `getReportSummary` endpoint (flags count, date only).
- Pagination on portal report list (if not already limited).

---

## Norma / Device Import Performance

### Ingest Flow

```
Norma → bridge/norma-listener.js → POST /devices/ingest/:id
  → device_messages INSERT
  → device-import.service.js
  → device-mapping-engine (per OBX row)
  → result-engine (per row)
  → results.service.enterResults()
```

### N+1 Pattern (HIGH impact on full CBC)

For each OBX parameter (~20–30 rows):

1. `mapDeviceResultToSystemParameter` — DB lookup
2. Optional `resolveParameter` — 2–3 queries
3. `enterResults` — transaction per test batch

**Estimated:** 40–90 queries per Norma CBC import.

### Recommendations

- Batch-load all device parameter mappings for device_id once per message — P1.
- Cache reference ranges in memory for import session — P2.
- Single transaction for entire import — P1 (also data integrity).

### Bridge Performance

- `norma-listener.js`: synchronous forward with 3 retries, 45s timeout.
- ACK sent to Norma before cloud confirms — no local queue.
- Concurrent HL7 messages on same socket may overlap (async handler).

---

## Barcode & Label Performance

### Backend

- `barcode-engine.service.js` — pure computation, negligible CPU.
- Barcode image generation (bwip-js) — ~50–200ms per label.

### Frontend

- ZPL generation — client-side, instant.
- Zebra print via local bridge — network to localhost:9100, ~100ms.
- `@zxing/library` in bundle — increases initial JS load; camera scan only on demand.

**Assessment:** Label path is **not a bottleneck** for production throughput.

---

## Frontend Performance

### Bundle Size

- No route lazy loading — all ~30 pages in initial bundle.
- i18n dictionary ~1700 lines inline in main chunk.
- Framer Motion page transitions remount full page on navigation.

### Large Components

| File | Lines | Concern |
|------|-------|---------|
| Tests.jsx | ~1236 | Single bundle, no virtualization |
| Parasitology.jsx | ~951 | Heavy state + fetch |
| WorkflowCase.jsx | ~811 | Registration flow monolith |

### Auth Overhead

- `/auth/me` called on: focus, visibility, 5-min interval, **every route change**.

### Recommendations

- `React.lazy()` per route — P1 (30–50% initial load reduction).
- Split i18n per locale — P2.
- Debounce auth refresh on route change — P2.

---

## Memory & CPU

### Backend Process

| Component | Memory |
|-----------|--------|
| Node.js base | ~80 MB |
| Express + deps | ~50 MB |
| Puppeteer/Chromium (during PDF) | +200–400 MB |
| canvas (Arabic text) | +50 MB per operation |

**Risk:** PDF + Norma import + dashboard concurrently on starter plan → OOM or slow responses.

### Notification Poller

- `setInterval` every 60s in `index.js` — lightweight query.
- Properly catches promise rejections ✅

---

## Caching Strategy

| Layer | Present | Opportunity |
|-------|---------|-------------|
| HTTP cache headers | ⚠️ Static assets via Express | CDN for frontend |
| API response cache | ❌ | Dashboard stats (60s TTL) |
| DB query cache | ❌ | Permission load per user |
| PDF cache | ⚠️ pdf_url in DB | Invalidated on every deploy |
| Redis | ❌ | Sessions, queues, rate limits |

---

## Load Testing Recommendations

Before declaring production-ready, run:

1. **k6 or Artillery** — 50 concurrent staff users, sample list + detail.
2. **Norma burst** — 10 CBC imports in 60 seconds.
3. **PDF burst** — 5 simultaneous report PDF generations.
4. **Portal** — 20 customers loading dashboard concurrently.

**Target SLAs (single lab):**
- API p95 < 500ms (non-PDF)
- PDF generation < 15s p95
- Norma import < 10s p95
- Portal dashboard < 3s p95

---

## Performance Findings Priority

| ID | Severity | Finding | Effort |
|----|----------|---------|--------|
| PERF-01 | High | Missing FK indexes | 2 hours |
| PERF-02 | High | Norma import N+1 queries | 1–2 days |
| PERF-03 | Medium | Portal dashboard multi-preview | 1 day |
| PERF-04 | Medium | PDF synchronous in request | 2–3 days |
| PERF-05 | Medium | PDF cache wipe on deploy | 2 hours |
| PERF-06 | Medium | Auth 2 queries per request | 4 hours |
| PERF-07 | Medium | Frontend no code splitting | 1 day |
| PERF-08 | Low | Sample list correlated subqueries | 4 hours |
| PERF-09 | Low | /auth/me on every route change | 2 hours |

---

## Performance Score Breakdown

| Area | Score | Notes |
|------|-------|-------|
| Database queries | 68 | Missing indexes, N+1 in import |
| PDF generation | 65 | Sync, no queue |
| Portal | 72 | Works; dashboard heavy |
| Barcode | 90 | Lightweight |
| Norma import | 60 | N+1 pattern |
| Frontend load | 65 | Large bundle |
| Scalability headroom | 60 | Single node limits |
| **Overall** | **70** | OK for single lab today |

---

*Dynamic profiling (clinic.js, Render metrics) recommended to validate estimates under real load.*
