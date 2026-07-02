# Known Limitations — Rare Vet LIMS v1.0

**Laboratory:** AL NAWADER VETERINARY CARE CENTER  
**Effective:** 2026-07-03  
**Scope:** Deferred features, partial implementations, and operational constraints at v1.0 release

---

## Purpose

This document lists **intentionally deferred** or **partially implemented** capabilities. Items here are not bugs unless behaviour contradicts documented design. Use during UAT scoping and customer expectations setting.

---

## Notifications & Communication

| Limitation | Status | Planned |
|------------|--------|---------|
| **SMS (Msegat) requires production configuration** | `SMS_ENABLED=false` by default on Render | Enable before portal OTP go-live |
| **Email password reset requires SMTP** | Email provider stub only; `SMTP_HOST` not wired | v1.1 full SMTP |
| **WhatsApp notifications** | Optional Twilio; not configured by default | When lab enables Twilio |
| **Automatic report SMS to customer** | Queue exists; depends on SMS config | After Msegat live |

---

## Portal & Customer Experience

| Limitation | Status | Planned |
|------------|--------|---------|
| **Portal OTP via SMS only in production** | Static OTP disabled (`PORTAL_OTP_STATIC=off`) | Configure Msegat |
| **No refresh token on portal** | Re-login required on 401 | v1.1 |
| **Portal mobile app (native)** | PWA/Capacitor scaffold only | **Version 1.2** |
| **Multi-language portal beyond AR/EN** | Staff i18n richer than portal | v1.1 |

---

## Laboratory & Devices

| Limitation | Status | Planned |
|------------|--------|---------|
| **Norma bridge — no local dead-letter queue** | Failed cloud forward after HL7 ACK not persisted locally | v1.1 |
| **Diasys Respons 910** | Supported in device catalog; ingest path exists | Full UAT on physical device required |
| **Mini Vidas** | ASTM protocol listed; serial/TCP setup lab-specific | v1.1 device UAT |
| **ELISA readers** | Manual result entry; no direct instrument feed in v1.0 | v1.1 integration |
| **PCR workflows** | Manual entry + report sections; no thermal cycler HL7 | v1.1 |
| **Multi-device concurrent ingest race** | Rare edge case on single socket | v1.1 queue |

---

## Workflow & Operations

| Limitation | Status | Planned |
|------------|--------|---------|
| **Workflow Engine off by default** | `WORKFLOW_ENGINE_ENABLED=false` | Enable after UAT sign-off |
| **Workflow events not auto-wired to all legacy actions** | Inference works; explicit recording partial | v1.1 |
| **Multi-branch / multi-lab** | Single lab instance | **Version 2.0** |
| **Advanced QC module** | Basic quality routes exist; full QC LIMS not in v1.0 | **Version 1.1** |
| **AI Assistant (result interpretation, chat)** | Not implemented | **Version 1.1** |

---

## Inventory & Billing

| Limitation | Status | Planned |
|------------|--------|---------|
| **Inventory advanced (reorder, lot expiry alerts)** | Basic CRUD + transactions | **Later** |
| **Ledger posting outside invoice transaction** | Invoice commits before journal entry | v1.1 atomic billing |
| **Multi-currency** | SAR only | v2.0 |

---

## Security & Infrastructure

| Limitation | Status | Planned |
|------------|--------|---------|
| **JWT stored in localStorage (staff + portal)** | XSS exposure if script injected | v1.1 httpOnly cookies / strict CSP |
| **Unprotected upload paths** | `animals/`, `signatures/` reachable if URL guessed | Phase 9B |
| **`access_token` in upload query strings** | Referer/log leakage risk | Phase 9B |
| **Render upload backup cron** | Cron job cannot access web disk directly; manual or S3 storage recommended | Ops procedure in DEPLOYMENT_CHECKLIST |
| **DB SSL on Render** | `DATABASE_SSL_REJECT_UNAUTHORIZED=false` until CA pinned | Pin Render CA |
| **No automated unit/integration test suite** | Verify scripts only | v1.1 CI tests |
| **Audit middleware partial** | Not all mutations logged | v1.1 |

---

## Frontend & UX

| Limitation | Status | Planned |
|------------|--------|---------|
| **No route lazy loading** | Large initial bundle | v1.1 performance |
| **Monolithic pages (Tests.jsx ~1200 lines)** | Functional but heavy | v1.1 refactor |
| **Client-side PDF fallback (html2canvas)** | Lower quality than server PDF | Use server PDF only in prod |
| **Zebra print requires local bridge** | Cloud LIMS cannot print directly to USB printer | Lab PC bridge mandatory |

---

## Reports & PDF

| Limitation | Status | Planned |
|------------|--------|---------|
| **PDF generation synchronous** | May slow API under concurrent PDF requests | v1.1 background queue |
| **migrate.js clears invoice/quote PDF cache on deploy** | PDFs regenerate on next request | v1.1 fix deploy hook |
| **Report design locked to Design 3 in production** | No runtime design switch without env change | By design |

---

## Scalability

| Limitation | Status | Planned |
|------------|--------|---------|
| **Single Render web instance** | No horizontal scaling | v2.0 |
| **PostgreSQL basic-256mb plan** | Suitable for single lab; monitor growth | Upgrade plan as needed |
| **5 GB upload disk** | Monitor PDF/image growth | S3 migration recommended |

---

## Version roadmap summary

| Version | Focus |
|---------|-------|
| **v1.0 (current)** | Core LIMS, Norma CBC, reports, portal, barcode, security P0 |
| **v1.1** | QC, AI assistant, SMTP, workflow wiring, security P1, device expansions |
| **v1.2** | Native mobile app, advanced notifications |
| **v2.0** | Multi-branch, scaling, enterprise features |

---

*Update this document when deferring new scope during UAT or go-live planning.*
