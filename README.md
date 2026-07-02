# Rare Veterinary Care - Cloud LIMS

A production-ready, cloud-based Veterinary Laboratory Information Management System (LIMS) built for **Rare Veterinary Care**.

## Features

- **Multi-role access**: Admin, Manager, Reception, Lab Technician, Veterinarian, Accountant
- **Customer & Animal Management** with full history tracking
- **Sample Workflow**: Register → Barcode → Track → Results → Reports
- **Barcode System**: Code128, QR codes, USB & camera scanning, thermal print support
- **Laboratory Tests**: CBC, Chemistry, Hormones, PCR, ELISA, Culture, Serology, Microscopy
- **Results System**: Manual entry, auto-flagging, critical alerts, validation
- **PDF Reports**: Bilingual (Arabic/English), QR verification, professional layout
- **Billing**: VAT invoices, QR codes, payments, packages, refunds
- **Inventory**: Stock tracking, expiry alerts, lot numbers
- **Quality Control**: QC records, maintenance, calibration, temperature logs
- **Admin Dashboard**: Statistics, charts, technician performance
- **Notifications**: Architecture ready for WhatsApp, SMS, Email
- **Device Integration**: Ready for Diasys Respons 910, Norma CBC, Mini Vidas (HL7/ASTM/TCP/Serial)
- **Arabic RTL** + English, Dark/Light theme, Mobile responsive

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TailwindCSS, Vite, i18next, Recharts |
| Backend | Node.js, Express, JWT |
| Database | PostgreSQL 16 |
| Auth | JWT + Role-based permissions |
| Storage | Local / S3-compatible cloud storage |
| Deployment | Docker Compose |

## Quick Start

```bash
# Clone and setup
cd rare-vet-lims

# Start with Docker
docker-compose up -d

# Seed database (first time)
docker exec rare-vet-lims-api node src/scripts/seed.js
```

Access:
- **Frontend**: http://localhost:5173
- **API**: http://localhost:5000/api
- **API Docs**: http://localhost:5000/api/docs

**Default Login**: `admin@rarevetcare.com` / `Admin@123`

## Project Structure

```
rare-vet-lims/
├── backend/                 # Express API
│   ├── migrations/          # PostgreSQL schema
│   ├── src/
│   │   ├── config/          # Database, env, logger, storage
│   │   ├── middleware/      # Auth, validation, audit, errors
│   │   ├── routes/          # REST API routes
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Barcode, PDF, permissions
│   │   └── scripts/         # Seed & migration scripts
│   └── uploads/             # File storage
├── frontend/                # React SPA
│   └── src/
│       ├── components/      # UI, layout, barcode
│       ├── context/         # Auth, theme
│       ├── i18n/            # Arabic/English translations
│       ├── pages/           # All application pages
│       └── services/        # API client
├── docker-compose.yml
├── INSTALLATION.md
└── DEPLOYMENT.md
```

## User Roles

| Role | Key Access |
|------|-----------|
| Admin | Full system access |
| Manager | Operations, reports, billing, inventory |
| Reception | Customers, animals, samples, billing |
| Lab Technician | Sample queue, result entry, QC |
| Veterinarian | Result validation, report generation |
| Accountant | Billing, payments, refunds, audit |

## API Documentation

Interactive Swagger docs available at `/api/docs` when the backend is running.

See [INSTALLATION.md](./INSTALLATION.md) for local development setup.  
See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment guide.

## Engineering documentation

Baseline inventory, architecture, and safety docs (Phase 0):

| Document | Purpose |
|----------|---------|
| [PROJECT_INVENTORY.md](./PROJECT_INVENTORY.md) | Repo inventory — modules, pages, scripts |
| [DEPENDENCY_MAP.md](./DEPENDENCY_MAP.md) | Service layers, hubs, report pipeline |
| [DEAD_CODE_REPORT.md](./DEAD_CODE_REPORT.md) | Orphan / legacy code — safe removal order |
| [DATABASE_DOCUMENTATION.md](./DATABASE_DOCUMENTATION.md) | PostgreSQL schema, tables, data flows |
| [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) | Full REST API (~172 endpoints) |
| [LIMS_ENTERPRISE_V2_ARCHITECTURE.md](./LIMS_ENTERPRISE_V2_ARCHITECTURE.md) | v2 target architecture (design only) |

**Change control & operations (Phase 0 safety baseline):**

| Document | Purpose |
|----------|---------|
| [CHANGE_CONTROL.md](./CHANGE_CONTROL.md) | Rules before any delete, migration, or risky change |
| [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) | Mandatory manual regression checklist |
| [BACKUP_AND_ROLLBACK.md](./BACKUP_AND_ROLLBACK.md) | DB + uploads backup and rollback procedures |

Legacy API summary: [backend/API.md](./backend/API.md)

## License

Proprietary - Rare Veterinary Care
