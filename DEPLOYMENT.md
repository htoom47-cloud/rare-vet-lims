# Deployment Guide - Rare Veterinary Care LIMS

## Production Architecture

```
                    ┌─────────────┐
                    │   Nginx /   │
                    │   CDN       │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌───▼───┐ ┌─────▼─────┐
       │  Frontend   │ │  API  │ │ PostgreSQL│
       │  (React)    │ │(Node) │ │    16     │
       └─────────────┘ └───┬───┘ └───────────┘
                           │
                    ┌──────▼──────┐
                    │   Storage   │
                    │ Local / S3  │
                    └─────────────┘
```

---

## Docker Production Deployment

### 1. Server Requirements

- Ubuntu 22.04+ or similar Linux
- 4 GB RAM minimum (8 GB recommended)
- 50 GB SSD
- Docker 24+ and Docker Compose v2

### 2. Prepare Environment

```bash
# On production server
git clone <repository-url> /opt/rare-vet-lims
cd /opt/rare-vet-lims

# Create production env file
cat > .env << 'EOF'
DB_USER=lims_user
DB_PASSWORD=<strong-db-password>
DB_NAME=rare_vet_lims
JWT_SECRET=<64-char-random-secret>
CORS_ORIGIN=https://lims.rarevetcare.com
VITE_API_URL=https://api.lims.rarevetcare.com/api
API_PORT=5000
WEB_PORT=80
EOF
```

### 3. Build and Deploy

```bash
docker-compose up -d --build
docker exec rare-vet-lims-api node src/scripts/seed.js
```

### 4. SSL with Reverse Proxy

Use Nginx or Traefik in front of Docker services:

```nginx
# /etc/nginx/sites-available/rare-vet-lims
server {
    listen 443 ssl http2;
    server_name lims.rarevetcare.com;

    ssl_certificate /etc/letsencrypt/live/lims.rarevetcare.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lims.rarevetcare.com/privkey.pem;

    location / {
        proxy_pass http://localhost:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /uploads {
        proxy_pass http://localhost:5000;
    }
}
```

---

## Cloud Deployment (Render — Recommended)

Fastest way to go online with one URL for frontend + API.

### Prerequisites

- GitHub account
- [Render](https://render.com) account (free tier available)
- Project pushed to a GitHub repository

### Steps

1. Push the project to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Prepare cloud deployment"
   git remote add origin https://github.com/YOUR_USER/rare-vet-lims.git
   git push -u origin main
   ```

2. In Render: **New → Blueprint** → connect the repo → Render reads `render.yaml`.

3. Wait for deploy (5–10 minutes on first build).

4. Open your app URL, e.g. `https://rare-vet-lims.onrender.com`

5. Login: `admin@rarevetcare.com` / `Admin@123` — **change password immediately**.

6. After first successful deploy, set `RUN_SEED=false` in Render environment variables (so seed does not run on every restart).

### Environment variables (Render)

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `SERVE_FRONTEND` | `true` |
| `RUN_SEED` | `true` (first deploy only) |
| `DATABASE_URL` | Auto from PostgreSQL addon |
| `JWT_SECRET` | Auto-generated |
| `APP_URL` | Your Render URL (optional, auto-detected) |

### Railway (alternative)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub.
2. Add **PostgreSQL** plugin → copy `DATABASE_URL` to the web service.
3. Set env: `SERVE_FRONTEND=true`, `RUN_SEED=true`, `JWT_SECRET=<random>`.
4. Build: `npm run build:cloud` — Start: `npm run start:cloud` (see `railway.toml`).

### Notes

- **Uploads**: Cloud disks are ephemeral on free tiers. For production files use S3 (`STORAGE_TYPE=s3`).
- **Cold start**: Free Render plan sleeps after inactivity; first visit may take ~30s.
- **HTTPS**: Provided automatically by Render/Railway.

---

## Cloud Deployment Options

### AWS

| Service | Purpose |
|---------|---------|
| ECS / EKS | Container orchestration |
| RDS PostgreSQL | Managed database |
| S3 | File storage for reports/images |
| ALB | Load balancing |
| CloudFront | CDN for frontend |

Set in `.env`:
```env
STORAGE_TYPE=s3
S3_BUCKET=rare-vet-lims-prod
S3_REGION=me-south-1
S3_ACCESS_KEY=<key>
S3_SECRET_KEY=<secret>
```

### Azure

- Azure Container Apps for API/Frontend
- Azure Database for PostgreSQL
- Azure Blob Storage for files

### Google Cloud

- Cloud Run for containers
- Cloud SQL PostgreSQL
- Cloud Storage for files

---

## Security Checklist

- [ ] Change all default passwords
- [ ] Set strong `JWT_SECRET` (64+ random characters)
- [ ] Enable HTTPS/TLS everywhere
- [ ] Restrict database port (no public exposure)
- [ ] Set `NODE_ENV=production`
- [ ] Configure firewall (only 80/443 open)
- [ ] Enable database backups (daily)
- [ ] Set up log aggregation
- [ ] Review role permissions
- [ ] Disable demo accounts or change passwords

---

## Database Backups

### Render (recommended)

1. [Render Dashboard](https://dashboard.render.com) → **rare-vet-db** → **Backups**
2. Enable automatic daily backups on paid database plans

### Manual backup from your PC

Use the Render **External Database URL** (not the internal one):

```powershell
cd backend
$env:DATABASE_URL="postgresql://..."
npm run backup
```

Saves to `backend/backups/rare-vet-lims-YYYY-MM-DD.sql.gz`.  
If `STORAGE_TYPE=s3` and S3 credentials are set, the backup is also uploaded to `s3://bucket/backups/db/`.

Optional env: `BACKUP_DIR`, `BACKUP_RETENTION_DAYS=30`, `BACKUP_S3_PREFIX=backups/db`

Requires **pg_dump** (PostgreSQL client tools).

### Restore

```bash
gunzip -c backend/backups/rare-vet-lims-2026-06-15.sql.gz | psql "$DATABASE_URL"
```

### Docker (self-hosted)

```bash
#!/bin/bash
# /opt/scripts/backup-lims.sh
DATE=$(date +%Y%m%d_%H%M%S)
docker exec rare-vet-lims-db pg_dump -U lims_user rare_vet_lims | gzip > /backups/lims_$DATE.sql.gz
find /backups -name "lims_*.sql.gz" -mtime +30 -delete
```

Add to crontab:
```bash
0 2 * * * /opt/scripts/backup-lims.sh
```

### Restore (Docker)

```bash
gunzip -c /backups/lims_20260101_020000.sql.gz | docker exec -i rare-vet-lims-db psql -U lims_user rare_vet_lims
```

---

## Persistent file storage (S3)

On Render, local `./uploads` is **ephemeral** — PDF reports may be lost on redeploy.

1. Create an S3 bucket (AWS `me-south-1` or Cloudflare R2)
2. In Render → **Environment** set:
   - `STORAGE_TYPE=s3`
   - `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
   - `S3_ENDPOINT` only for R2/MinIO
3. Redeploy — new PDFs are stored in S3; existing DB records can regenerate PDFs on open

---

## Monitoring

### Health Checks

- API: `GET /api/health`
- Database: Docker healthcheck in compose file

### Recommended Tools

- **Uptime**: UptimeRobot, Pingdom
- **Logs**: ELK Stack, Grafana Loki
- **Metrics**: Prometheus + Grafana
- **Errors**: Sentry

---

## Scaling

### Horizontal API Scaling

```yaml
# docker-compose.override.yml
services:
  backend:
    deploy:
      replicas: 3
```

Use a load balancer in front of multiple API instances. All instances share the same PostgreSQL and S3 storage.

### Database

- Enable connection pooling (PgBouncer)
- Read replicas for reporting queries
- Regular VACUUM and index maintenance

---

## Future Integrations

### SMS & WhatsApp Notifications (Twilio)

1. Create a [Twilio](https://www.twilio.com) account and buy an SMS-capable number (Saudi +966 or international).
2. In Render → **Environment**, add:

| Variable | Example |
|----------|---------|
| `SMS_ENABLED` | `true` |
| `WHATSAPP_ENABLED` | `false` (or `true` after WhatsApp Business setup) |
| `NOTIFICATION_DEFAULT_CHANNEL` | `sms` |
| `TWILIO_ACCOUNT_SID` | From Twilio console |
| `TWILIO_AUTH_TOKEN` | From Twilio console |
| `TWILIO_SMS_FROM` | `+9665XXXXXXXX` |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (sandbox) or your approved sender |

3. Redeploy. The **Send SMS** / **Send WhatsApp** buttons appear on Reports and Sample detail when the channel is enabled.
4. Messages include sample code, report number, verification code, and lab phone.

**WhatsApp:** Use Twilio WhatsApp Sandbox for testing, or complete Meta Business verification for production.

### Lab Device Integration
Configure devices via `/api/devices` endpoint. Supported protocols:
- HL7 (Norma CBC)
- ASTM (Diasys Respons 910, Mini Vidas)
- TCP/IP and Serial COM

### Thermal Printers
Barcode labels and receipts support browser print API. For direct thermal printer integration, configure ESC/POS drivers on the client workstation.

---

## Support

For deployment assistance, contact the development team at lab@rarevetcare.com.
