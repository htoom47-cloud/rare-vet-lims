# Installation Guide - Rare Veterinary Care LIMS

## Prerequisites

- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **PostgreSQL** 16+ ([postgresql.org](https://postgresql.org))
- **npm** 9+
- **Docker** & **Docker Compose** (optional, recommended)

---

## Option 1: Docker Installation (Recommended)

### Step 1: Clone the project

```bash
git clone <repository-url> rare-vet-lims
cd rare-vet-lims
```

### Step 2: Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set a strong `JWT_SECRET`:

```env
JWT_SECRET=your-very-long-random-secret-key-here
```

### Step 3: Start all services

```bash
docker-compose up -d --build
```

This starts:
- PostgreSQL on port 5432
- Backend API on port 5000
- Frontend on port 5173

### Step 4: Seed the database

```bash
docker exec rare-vet-lims-api node src/scripts/seed.js
```

### Step 5: Access the application

| Service | URL |
|---------|-----|
| Web App | http://localhost:5173 |
| API | http://localhost:5000/api |
| API Docs | http://localhost:5000/api/docs |

---

## Option 2: Local Development Installation

### Step 1: Setup PostgreSQL

Create database and user:

```sql
CREATE USER lims_user WITH PASSWORD 'lims_password';
CREATE DATABASE rare_vet_lims OWNER lims_user;
GRANT ALL PRIVILEGES ON DATABASE rare_vet_lims TO lims_user;
```

Run the schema:

```bash
psql -U lims_user -d rare_vet_lims -f backend/migrations/init.sql
```

### Step 2: Setup Backend

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

Backend runs at http://localhost:5000

### Step 3: Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at http://localhost:5173

---

## Default User Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@rarevetcare.com | Admin@123 |
| Manager | manager@rarevetcare.com | Manager@123 |
| Reception | reception@rarevetcare.com | Reception@123 |
| Lab Technician | tech@rarevetcare.com | Tech@123 |
| Veterinarian | vet@rarevetcare.com | Vet@123 |
| Accountant | accountant@rarevetcare.com | Account@123 |

> **Important**: Change all default passwords before production deployment.

---

## Verifying Installation

1. Open http://localhost:5173
2. Login with admin credentials
3. Check API health: http://localhost:5000/api/health
4. Browse API docs: http://localhost:5000/api/docs
5. Toggle Arabic/RTL and dark mode from the header
6. Register a test customer, animal, and sample

---

## Troubleshooting

### Database connection failed
- Verify PostgreSQL is running
- Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` in `.env`
- Ensure database exists and schema is applied

### CORS errors
- Set `CORS_ORIGIN` in backend `.env` to your frontend URL

### Port already in use
- Change ports in `docker-compose.yml` or `.env`:
  - `API_PORT=5001`
  - `WEB_PORT=5174`
  - `DB_PORT=5433`

### Seed script errors
- Ensure schema is applied first (`init.sql`)
- Run seed only once, or truncate tables before re-seeding

---

## Next Steps

- Configure cloud storage (S3) in `.env` for production file storage
- Enable notification channels (WhatsApp, SMS, Email)
- Configure device integrations for lab analyzers
- See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment
