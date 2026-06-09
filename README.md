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

## License

Proprietary - Rare Veterinary Care
