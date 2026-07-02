# Post Go-Live Checklist — Week 1 Review

**Laboratory:** AL NAWADER VETERINARY CARE CENTER  
**Go-live date:** _______________  
**Review date (Day 7):** _______________  
**Reviewer:** _______________

Complete this checklist **7 days after** production go-live. Compare metrics to UAT baseline and log issues in [BUG_TRACKER.md](./BUG_TRACKER.md).

---

## 1. Error volume

| Metric | Day 1 | Day 3 | Day 7 | Target |
|--------|-------|-------|-------|--------|
| Critical bugs open | | | | 0 |
| High bugs open | | | | ≤ 2 |
| Medium bugs open | | | | Track only |
| Render 5xx errors (count) | | | | < 10/day |
| Failed Norma imports | | | | < 5% |
| Failed portal OTP | | | | < 2% |

| ☐ | Reviewed Render logs for unhandled errors |
| ☐ | Reviewed `audit_logs` for unusual activity |
| ☐ | All P0/P1 bugs from week 1 triaged in BUG_TRACKER |

---

## 2. Performance

| Metric | Target | Day 7 actual | Pass? |
|--------|--------|--------------|-------|
| Sample list load (500 samples) | < 3s | | ☐ |
| Norma CBC import | < 15s | | ☐ |
| PDF generation (typical CBC) | < 20s | | ☐ |
| Portal dashboard load | < 5s | | ☐ |
| API health uptime | > 99% | | ☐ |

| ☐ | No OOM / restart events on Render |
| ☐ | Disk usage `/var/data/uploads` below 80% of 5 GB |
| ☐ | Database connection pool stable (no timeout spikes) |

---

## 3. Report quality & speed

| ☐ | Item | Notes |
|---|------|-------|
| ☐ | Staff report preview matches PDF (spot-check 5 reports) | |
| ☐ | Portal report matches staff preview (spot-check 3 customers) | |
| ☐ | Arabic rendering correct in all spot-check PDFs | |
| ☐ | No missing sections (CBC/Chem/Parasites) when ordered | |
| ☐ | Flags (HIGH/LOW) match reference ranges | |
| ☐ | Average time from results complete → report approved | _____ min |
| ☐ | Customer complaints about report content | ☐ None ☐ List in BUG_TRACKER |

---

## 4. Staff feedback

Interview reception, lab technicians, and doctors. Record in Notes column.

| Role | Tester | Satisfied? | Top 3 issues | Action |
|------|--------|------------|--------------|--------|
| Reception | | ☐ Yes ☐ Partial ☐ No | | |
| Lab technician | | ☐ Yes ☐ Partial ☐ No | | |
| Doctor / specialist | | ☐ Yes ☐ Partial ☐ No | | |
| Accountant | | ☐ Yes ☐ Partial ☐ No | | |
| Manager | | ☐ Yes ☐ Partial ☐ No | | |

| ☐ | Training gaps identified → schedule refresher |
| ☐ | Zebra/bridge issues documented |
| ☐ | Workflow confusion documented (if engine enabled) |

---

## 5. Customer feedback (Portal)

| ☐ | Item | Result |
|---|------|--------|
| ☐ | OTP delivery success rate (estimate) | _____ % |
| ☐ | Customer login support calls | _____ calls |
| ☐ | PDF download failures reported | ☐ None ☐ Count: ___ |
| ☐ | Reports missing from portal (when should be visible) | ☐ None ☐ Count: ___ |
| ☐ | Customer satisfaction (informal) | ☐ Positive ☐ Mixed ☐ Negative |

---

## 6. Resource consumption

| Resource | Day 1 | Day 7 | Action if high |
|----------|-------|-------|----------------|
| Render CPU avg | | | Upgrade plan |
| Render memory avg | | | Upgrade plan |
| DB size (MB) | | | Monitor growth |
| Upload disk used (GB) | | | Enable S3 / expand disk |
| Monthly Render cost | | | Budget review |

| ☐ | Upload backup ran successfully at least once |
| ☐ | DB backup ran daily (check cron logs) |

---

## 7. Backup & recovery

| ☐ | Item | Date tested | Result |
|---|------|-------------|--------|
| ☐ | DB backup file downloaded and inspected | | |
| ☐ | Uploads backup exists (manual or cron) | | |
| ☐ | Restore procedure still documented and accessible | | |
| ☐ | No data loss incidents during week 1 | | |

---

## 8. Security

| ☐ | Item | Result |
|---|------|--------|
| ☐ | No unauthorized login attempts succeeded | |
| ☐ | Login rate limit triggered (if any) — investigate IPs | |
| ☐ | Device API keys not exposed in logs or UI | |
| ☐ | Portal static OTP confirmed off | |
| ☐ | No secrets committed to git during week 1 | |
| ☐ | SSL certificates valid (> 30 days remaining) | |

---

## 9. Workflow (if enabled)

| ☐ | Item | Result |
|---|------|--------|
| ☐ | Workflow states match actual sample progress (spot-check 10 samples) | |
| ☐ | Timeline events recorded in audit_logs | |
| ☐ | Dashboard workflow counts reasonable | |
| ☐ | Invalid transitions blocked (publish before approve) | |

---

## 10. Devices & Norma

| ☐ | Item | Week 1 count | Notes |
|---|------|--------------|-------|
| ☐ | Total Norma CBC imports | | |
| ☐ | Failed/unmatched device messages | | |
| ☐ | Bridge downtime incidents | | |
| ☐ | Sample ID mismatch (barcode vs Norma) | | |
| ☐ | Diasys / other devices | ☐ N/A ☐ Tested | |

---

## 11. Billing & operations

| ☐ | Invoices created match samples processed |
| ☐ | Payment totals reconcile with daily closing |
| ☐ | No duplicate invoice incidents |
| ☐ | Inventory movements accurate (if used) |

---

## 12. Decision — Week 1 sign-off

| Question | Answer |
|----------|--------|
| System stable for continued production? | ☐ Yes ☐ Conditional ☐ No |
| P0 bugs remaining? | ☐ None ☐ List: |
| Plan v1.1 priorities | |
| Next review date (Day 30) | |

| Role | Name | Signature | Date |
|------|------|-----------|------|
| IT | | | |
| Lab Manager | | | |

---

*Log all defects in [BUG_TRACKER.md](./BUG_TRACKER.md). Update [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) if new constraints discovered.*
