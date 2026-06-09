# API Documentation - Rare Veterinary Care LIMS

Base URL: `http://localhost:5000/api`

Interactive docs: `http://localhost:5000/api/docs`

## Authentication

All protected endpoints require JWT Bearer token:

```
Authorization: Bearer <access_token>
```

### POST /auth/login
```json
{ "email": "admin@rarevetcare.com", "password": "Admin@123" }
```

### POST /auth/refresh
```json
{ "refreshToken": "<refresh_token>" }
```

### POST /auth/logout
### POST /auth/forgot-password
### POST /auth/reset-password
### GET /auth/me

---

## Customers

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /customers | customers.view | List customers |
| GET | /customers/:id | customers.view | Customer profile with history |
| POST | /customers | customers.create | Create customer |
| PUT | /customers/:id | customers.update | Update customer |
| DELETE | /customers/:id | customers.delete | Deactivate customer |

---

## Animals

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /animals | animals.view | List animals |
| GET | /animals/:id?history=true | animals.view | Animal with sample history |
| POST | /animals | animals.create | Register animal |
| PUT | /animals/:id | animals.update | Update animal |
| POST | /animals/:id/image | animals.update | Upload animal image |
| DELETE | /animals/:id | animals.delete | Deactivate animal |

---

## Samples

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /samples | samples.view | List samples |
| GET | /samples/queue | samples.view | Technician queue |
| GET | /samples/scan/:barcode | samples.view | Scan barcode lookup |
| GET | /samples/:id | samples.view | Sample details |
| GET | /samples/:id/barcode | samples.view | Generate barcode image |
| POST | /samples | samples.create | Register sample |
| PATCH | /samples/:id/status | samples.update | Update status |

---

## Tests

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /tests/categories | tests.view | Test categories |
| GET | /tests | tests.view | List tests |
| GET | /tests/:id | tests.view | Test with parameters & ranges |
| POST | /tests | tests.manage | Create test |
| PUT | /tests/:id | tests.manage | Update test |
| POST | /tests/:id/parameters | tests.manage | Add parameter |
| POST | /tests/parameters/:id/ranges | tests.manage | Add reference range |

---

## Results

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /results/critical | results.view | Critical value alerts |
| GET | /results/sample-test/:id | results.view | Get results |
| GET | /results/previous/:animalId/:parameterId | results.view | Previous results |
| POST | /results/enter | results.enter | Enter results |
| POST | /results/validate/:sampleTestId | results.validate | Validate results |

---

## Reports

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /reports | reports.view | List reports |
| POST | /reports/generate/:sampleId | reports.generate | Generate PDF report |
| GET | /reports/verify/:code | Public | Verify report QR |
| GET | /reports/download/:filename | reports.view | Download PDF |

---

## Billing

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /billing/invoices | billing.view | List invoices |
| GET | /billing/packages | billing.view | List packages |
| POST | /billing/invoices | billing.create | Create invoice |
| POST | /billing/payments | billing.payment | Record payment |
| POST | /billing/refunds | billing.refund | Process refund |

---

## Inventory

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /inventory | inventory.view | List items |
| GET | /inventory/alerts | inventory.view | Low stock & expiry alerts |
| GET | /inventory/:id | inventory.view | Item with transactions |
| POST | /inventory | inventory.manage | Create item |
| PUT | /inventory/:id | inventory.manage | Update item |
| POST | /inventory/:id/adjust | inventory.manage | Adjust stock |

---

## Quality Control

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET/POST | /quality/qc | quality.* | QC records |
| GET/POST | /quality/maintenance | quality.* | Device maintenance |
| GET/POST | /quality/calibrations | quality.* | Calibration logs |
| GET/POST | /quality/temperature | quality.* | Temperature logs |

---

## Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /dashboard/stats | Admin stats or technician dashboard |

---

## Users & Permissions

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /users | users.view | List users |
| GET | /users/roles | users.view | List roles |
| GET | /users/roles/:id/permissions | users.view | Role permissions |
| POST | /users | users.create | Create user |
| PUT | /users/:id | users.update | Update user |

---

## Audit Logs

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | /audit | audit.view | List audit logs |

---

## Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /notifications | List notification queue |
| POST | /notifications/queue | Queue notification |
| POST | /notifications/send-report/:sampleId | Queue report notification |

---

## Device Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /devices | List configured & supported devices |
| POST | /devices | Configure device |
| PUT | /devices/:id | Update device |
| POST | /devices/:id/messages | Receive device message |
| GET | /devices/:id/messages | List device messages |

---

## Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /settings/public | Public lab info |
| GET | /settings | Get all settings |
| PUT | /settings/:key | Update setting |

---

## Response Format

### Success
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed"
  }
}
```
