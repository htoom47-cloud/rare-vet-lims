# Portal Mobile → Report Link Audit

> Audit date: 2026-07-03
> Scope: Code analysis + local DB verification (9 customers, 9 reports)
> Status: **Architectural issue identified**

---

## 1. How the Portal Links a Mobile to Reports (Current Flow)

```
User enters mobile number
        │
        ▼
normalizeMobileDigits(mobile)
  - strips non-digits
  - removes leading "966"
  - removes leading "0"
  → produces 9-digit suffix
        │
        ▼
findCustomerByMobile(mobile)
  SQL: WHERE regexp_replace(mobile, '[^0-9]', '', 'g') LIKE '%{last 9 digits}'
       ORDER BY created_at DESC
       LIMIT 1                          ← picks ONE customer only
        │
        ▼
issuePortalToken({ customerId: <that ONE ID> })
  JWT: { customerId, type: 'customer' }
        │
        ▼
All portal queries:
  WHERE s.customer_id = $1              ← scoped to SINGLE customer
```

### Mobile Normalization (Tested)

| Input format | After normalize | SQL LIKE | Match? |
|-------------|----------------|----------|--------|
| `0541148900` | `541148900` | `%541148900` | ✓ |
| `541148900` | `541148900` | `%541148900` | ✓ |
| `+966541148900` | `541148900` | `%541148900` | ✓ |
| `966541148900` | `541148900` | `%541148900` | ✓ |
| `00966541148900` | `0966541148900` | `%541148900` | ✓ |

All Saudi mobile formats normalize to the same 9-digit suffix. The DB-side also strips non-digits via `regexp_replace`. **Format differences are not a problem.**

---

## 2. Identified Issues

### Issue A: Duplicate Customers — Only Newest Gets Portal Access (CRITICAL)

`findCustomerByMobile` uses `LIMIT 1 ORDER BY created_at DESC`.

If two customer records share the same mobile number:
- **Newest** customer → gets portal access
- **Oldest** customer → reports are **invisible** in the portal

**All** portal queries (reports, animals, documents, invoices) filter by `s.customer_id = $1` using the single resolved customer ID.

**Impact:** Reports tied to the older customer record will never appear, even if they are approved + PDF.

**Current state (local DB):** No duplicates found (0 matches). This needs verification on **production**.

### Issue B: Invalid Mobile Entries (DATA QUALITY)

Found in local DB:

| Mobile | Issue |
|--------|-------|
| `لا` (Arabic for "no") | 0 digits → login impossible, reports unreachable |
| `10` | 2 digits → too short, login impossible |

Both pass `is_active = true` but fail `normalizeMobileDigits` (< 9 digits). These customers cannot log in to the portal.

### Issue C: Portal Reports Scoped to customer_id, Not Mobile

The portal does NOT aggregate reports across customers who share a mobile number. Every query is strictly `customer_id`-scoped:

| Endpoint | Filter |
|----------|--------|
| `GET /portal/reports` | `s.customer_id = $1` |
| `GET /portal/reports/:id/preview` | `assertReportOwnership(reportId, customerId)` |
| `GET /portal/reports/download/:filename` | `s.customer_id = $1` |
| `GET /portal/animals` | `a.owner_id = $1` |
| `GET /portal/documents` | `s.customer_id = $1` |
| `GET /portal/dashboard` | `s.customer_id = $1` |

---

## 3. Portal Visibility SQL

```sql
r.pdf_url IS NOT NULL
AND (
  r.lab_specialist_approved_by IS NOT NULL
  OR r.vet_approved_by IS NOT NULL
  OR r.is_final IS NOT FALSE       -- NULL counts as true!
)
```

Since `is_final` defaults to `NULL` in the schema, and `NULL IS NOT FALSE = TRUE`, **any report with a PDF is portal-visible** regardless of approval status.

### Local DB Report Visibility

| Metric | Count |
|--------|-------|
| Total reports | 9 |
| With PDF | 9 |
| Lab approved | 1 |
| Vet approved | 1 |
| `is_final = true` | 9 |
| `is_final = NULL` | 0 |
| `is_final = false` | 0 |
| Not portal-visible | 0 |

All 9 reports are portal-visible. No reports are hidden.

---

## 4. Local DB: Reports per Mobile

| Mobile | Customers | Animals | Samples | Reports | w/PDF | Portal-visible |
|--------|-----------|---------|---------|---------|-------|---------------|
| 0542957996 | 1 | 3 | 6 | 4 | 4 | 4 |
| 0541170439 | 1 | 1 | 1 | 1 | 1 | 1 |
| 0541332133 | 1 | 1 | 1 | 1 | 1 | 1 |
| 0541474505 | 1 | 1 | 1 | 1 | 1 | 1 |
| 0541545982 | 1 | 1 | 1 | 1 | 1 | 1 |
| 10 | 1 | 1 | 1 | 1 | 1 | 1 |
| 0541557403 | 1 | 1 | 1 | 0 | 0 | 0 |
| 0541148900 | 1 | 0 | 0 | 0 | 0 | 0 |
| لا | 1 | 0 | 0 | 0 | 0 | 0 |

No mobile has multiple customer records locally. **No data loss due to Issue A in local DB.**

Customer "10" has 1 report but cannot log in (mobile too short). That report is unreachable via portal.

---

## 5. Portal Login Simulation

For each mobile with reports, the portal picks exactly one customer (newest):

| Mobile | Chosen Customer | Portal Reports | Total Reports | Gap |
|--------|----------------|----------------|---------------|-----|
| 0542957996 | احمد | 4 | 4 | 0 |
| 0541170439 | E2E Customer | 1 | 1 | 0 |
| 0541332133 | E2E Customer | 1 | 1 | 0 |
| 0541474505 | E2E Customer | 1 | 1 | 0 |
| 0541545982 | E2E Customer | 1 | 1 | 0 |
| 10 | "10" | 1 | 1 | 0 (but login impossible) |

No gap found locally. **Production must be checked for duplicates.**

---

## 6. Reasons a Report Would Not Appear

| Reason | How to detect | Fix |
|--------|---------------|-----|
| No report row generated | `SELECT * FROM reports WHERE sample_id = ?` returns 0 | Generate report from Staff |
| `pdf_url IS NULL` | Report exists but PDF failed | Regenerate PDF from Staff |
| `is_final = false` + no approval | Explicit draft, no lab/vet approval | Approve report |
| Wrong `customer_id` | Sample linked to different customer | Fix sample's `customer_id` |
| Duplicate mobile → wrong customer picked | `LIMIT 1 ORDER BY created_at DESC` skips old record | Merge customers or aggregate by mobile |
| Mobile missing or invalid | `normalizeMobileDigits` produces < 9 digits | Fix customer mobile |
| Customer inactive | `is_active = false` | Reactivate customer |

---

## 7. Production Verification Needed

The local DB has only 9 customers and 9 reports (mostly E2E test data). To complete this audit on **production**:

### SQL to run on Render DB Dashboard

```sql
-- Duplicate mobiles
SELECT regexp_replace(mobile, '[^0-9]', '', 'g') AS digits,
       COUNT(*)::int AS n, array_agg(full_name) AS names
FROM customers WHERE is_active = true
  AND mobile IS NOT NULL AND TRIM(mobile) <> ''
GROUP BY digits HAVING COUNT(*) > 1;

-- Reports per mobile with gap detection
SELECT c.mobile,
       COUNT(DISTINCT c.id)::int AS custs,
       COUNT(DISTINCT r.id)::int AS reports
FROM customers c
JOIN samples s ON s.customer_id = c.id
JOIN reports r ON r.sample_id = s.id
WHERE c.is_active = true AND c.mobile IS NOT NULL
GROUP BY c.mobile ORDER BY custs DESC;

-- Non-visible reports
SELECT r.report_number, r.pdf_url, r.is_final,
       r.lab_specialist_approved_by IS NOT NULL AS lab,
       r.vet_approved_by IS NOT NULL AS vet,
       s.barcode, c.mobile
FROM reports r
JOIN samples s ON r.sample_id = s.id
LEFT JOIN customers c ON s.customer_id = c.id
WHERE NOT (r.pdf_url IS NOT NULL AND (
  r.lab_specialist_approved_by IS NOT NULL
  OR r.vet_approved_by IS NOT NULL
  OR r.is_final IS NOT FALSE));

-- Specific barcode search
SELECT s.id, s.sample_code, s.barcode, s.status,
       c.full_name, c.mobile, r.report_number, r.pdf_url
FROM samples s
LEFT JOIN customers c ON s.customer_id = c.id
LEFT JOIN reports r ON r.sample_id = s.id
WHERE s.barcode IN ('BC-260701-809831', 'BC-260701-961938');
```

---

## 8. Recommendations

### P0 — Data Fixes
1. Fix customer with mobile `لا` — enter real mobile number
2. Fix customer with mobile `10` — enter real mobile number

### P1 — Duplicate Mobile Handling
If production has duplicate mobiles (same person, multiple customer records):
- **Option A (recommended):** Merge customer records so one customer owns all samples/reports
- **Option B:** Change `findCustomerByMobile` to aggregate all customer IDs with the same mobile, and query reports for all of them

### P2 — Portal Visibility Tightening
Currently `is_final IS NOT FALSE` means NULL counts as visible. Consider requiring explicit approval for portal visibility:
```sql
r.pdf_url IS NOT NULL
AND (r.lab_specialist_approved_by IS NOT NULL OR r.vet_approved_by IS NOT NULL)
```

### P3 — Ready-Reports Customer-ID Binding
The `/customers/:id/ready-reports` endpoint is scoped to one customer_id. If the portal user's reports span multiple customer records (same mobile), the send-reports flow inherits the same gap.

---

## Conclusion

The portal's mobile normalization is **robust** — all Saudi number formats (`05x`, `+966x`, `966x`, `5x`) resolve to the same customer. The **architectural risk** is when multiple customer records share the same mobile: only the newest customer's reports appear. This needs production DB verification. No code bugs found in the normalization or visibility logic itself.
