# Go-Live Checklist — Rare Vet LIMS v1.0

**Laboratory:** AL NAWADER VETERINARY CARE CENTER  
**Target go-live date:** _______________  
**Environment:** Production (lims.rarevetcare.com)

Mark ☐ → ✓ only after verification. **All P0 items must be ✓ before opening to live patient traffic.**

---

## Sign-off header

| Field | Value |
|-------|-------|
| Tester / IT lead | |
| Lab director | |
| Git commit / deploy ID | |
| UAT completion date | |
| Bugs open (P0/P1) | |

---

## 1. Database

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | PostgreSQL `rare-vet-db` connected; `/api/health` shows `database: ok` | | |
| ☐ | Daily DB backup cron active (`rare-vet-db-backup` 03:00 UTC) | | |
| ☐ | Manual backup taken within 24h before go-live | | |
| ☐ | Restore drill completed on staging copy | | |
| ☐ | `RUN_SEED=false` in production | | |
| ☐ | Demo users purged; production admin password rotated | | |
| ☐ | Reference ranges populated for main species (camel, horse, etc.) | | |
| ☐ | Test catalog complete (CBC, Chemistry, Parasitology, etc.) | | |
| ☐ | `DATABASE_SSL_REJECT_UNAUTHORIZED` documented (Render CA) | | |

---

## 2. Users

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Admin account login works | | |
| ☐ | Reception accounts created (one per receptionist) | | |
| ☐ | Lab technician accounts created | | |
| ☐ | Doctor / lab specialist accounts created | | |
| ☐ | Accountant account (if billing separate) | | |
| ☐ | Default passwords changed; not shared on paper | | |
| ☐ | Inactive/demo users disabled | | |

---

## 3. Roles & Permissions

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Reception: customers, animals, samples, billing — no approve report | | |
| ☐ | Lab technician: results, Norma queue — no billing admin | | |
| ☐ | Doctor: approve/validate reports | | |
| ☐ | Manager: dashboard admin + user management | | |
| ☐ | Permission spot-check per role (see UAT ROL section) | | |

---

## 4. Printers (Zebra)

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Zebra 50×25mm labels loaded on reception printer | | |
| ☐ | Local Zebra bridge running on reception PC (HTTPS :9101) | | |
| ☐ | Test label prints from LIMS (WorkflowCase or Samples) | | |
| ☐ | Arabic customer name renders on label | | |
| ☐ | Code128 scans back into LIMS sample scan | | |

---

## 5. Barcode Scanner

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | USB scanner configured (keyboard wedge mode) | | |
| ☐ | Scan opens correct sample in Samples page | | |
| ☐ | Sample ID digits match label and database | | |

---

## 6. Norma (CBC)

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Norma device registered in LIMS Devices page | | |
| ☐ | API key regenerated; `bridge.env` updated on lab PC | | |
| ☐ | `norma-listener.js` running as service (port 21110) | | |
| ☐ | Norma LIS IP = lab PC; port 21110 | | |
| ☐ | Full CBC import end-to-end tested (UAT-NRM section) | | |
| ☐ | WBC and LYM% map correctly (not swapped) | | |

---

## 7. Diasys (Respons 910)

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Device registered (ASTM/TCP) if lab uses Diasys | | |
| ☐ | Connection parameters documented (host, port 5000) | | |
| ☐ | Manual or automated ingest tested OR marked N/A | | |

---

## 8. Mini Vidas / ELISA / PCR

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | ELISA/PCR tests in catalog with correct parameters | | |
| ☐ | Manual result entry workflow tested | | |
| ☐ | Reports show qualitative results correctly | | |
| ☐ | Mini Vidas marked N/A or configured if device present | | |

---

## 9. Customer Portal

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | `portal.rarevetcare.com` loads over HTTPS | | |
| ☐ | `PORTAL_OTP_STATIC=off` | | |
| ☐ | `SMS_ENABLED=true` + Msegat credentials configured | | |
| ☐ | OTP login tested with real customer mobile | | |
| ☐ | Published report visible; draft/reviewed hidden (unless configured) | | |
| ☐ | Portal PDF download = official server PDF | | |

---

## 10. SMS

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Msegat sender approved and active | | |
| ☐ | Test OTP delivered within 60 seconds | | |
| ☐ | Report-ready SMS template reviewed (Arabic) | | |

---

## 11. Reports & PDF

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | `REPORT_DESIGN=3` active | | |
| ☐ | CBC + Chemistry report generated and approved | | |
| ☐ | Staff preview matches PDF and portal | | |
| ☐ | Arabic headers and values render in PDF | | |
| ☐ | Public verify link `/verify/:code` works | | |
| ☐ | Approval signatures appear when validated | | |

---

## 12. Billing

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Invoice linked to sample tested | | |
| ☐ | Payment recording works | | |
| ☐ | Invoice PDF generates | | |
| ☐ | VAT number on invoice correct | | |

---

## 13. Workflow

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Decision documented: `WORKFLOW_ENGINE_ENABLED` true/false at go-live | | |
| ☐ | If enabled: workflow summary visible on sample detail | | |
| ☐ | Legacy `workflow` object still present (backward compat) | | |

---

## 14. Backups

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | DB backup verified (file size > 0) | | |
| ☐ | `UPLOAD_BACKUP_ENABLED=true` or manual uploads backup procedure documented | | |
| ☐ | `BACKUP_AND_ROLLBACK.md` accessible to IT | | |
| ☐ | Rollback to previous Render deploy tested | | |

---

## 15. SSL, Domain & Security

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | `lims.rarevetcare.com` SSL valid | | |
| ☐ | `portal.rarevetcare.com` SSL valid | | |
| ☐ | `JWT_SECRET` auto-generated (not default) | | |
| ☐ | Login rate limit active (5/15min) | | |
| ☐ | Forgot-password does NOT return token in JSON | | |
| ☐ | Device API keys hashed (regenerate if legacy plaintext) | | |
| ☐ | `verify-security-phase9.js` passed (20/20) | | |

---

## 16. Deploy & Performance

| ☐ | Item | Verified by | Date |
|---|------|-------------|------|
| ☐ | Latest deploy successful; boot logs clean | | |
| ☐ | All verify scripts passed | | |
| ☐ | UAT_TEST_BOOK critical paths signed off | | |
| ☐ | BUG_TRACKER P0 = 0 open | | |

---

## Final approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| IT / Deploy | | | |
| Lab Manager | | | |
| Medical Director | | | |

**Go-live authorized:** ☐ Yes ☐ No — reason: _______________

---

*Companion: [POST_GO_LIVE_CHECKLIST.md](./POST_GO_LIVE_CHECKLIST.md), [UAT_TEST_BOOK.md](./UAT_TEST_BOOK.md)*
