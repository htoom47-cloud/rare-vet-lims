# Norma Device Reference Ranges

## Overview

The LIMS synchronizes **normal (reference) ranges** from the **Norma Icon CBC** analyzer into PostgreSQL. Ranges are stored **per device, species, parameter, and unit** so horse WBC limits differ from camel, dog, etc.

Historical lab reports **freeze** the ranges that were imported with each result (`result_values.notes = Norma: …`) so future device updates do not alter old PDFs.

---

## Architecture

```
┌─────────────┐     HL7/ASTM      ┌──────────────────┐     HTTPS POST      ┌─────────────────┐
│ Norma Icon  │ ────────────────► │ Local Bridge     │ ──────────────────► │ LIMS API        │
│ 192.168.x   │   ORU^R01         │ zebra-local-     │  /api/devices/      │ devices.routes  │
│             │                   │ bridge.js        │  ingest/:deviceId   │                 │
└─────────────┘                   └──────────────────┘                     └────────┬────────┘
                                                                                    │
                                         ┌──────────────────────────────────────────┘
                                         ▼
                              ┌──────────────────────┐
                              │ parseDeviceMessage() │
                              │  HL7 / ASTM / CSV    │
                              └──────────┬───────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
         device-import.service   device-reference-      device_messages
         (result values +         ranges.service         (raw_message audit)
          Norma: notes)            (upsert ranges)
                    │                    │
                    ▼                    ▼
              result_values      device_reference_ranges
              results            device_reference_range_logs
                    │
                    ▼
              reports.service
              (notes snapshot first,
               then live DB fallback)
```

### Key tables

| Table | Purpose |
|-------|---------|
| `device_reference_ranges` | Current Norma ranges: device + species + parameter + unit → low/high |
| `device_reference_range_logs` | Append-only change log when ranges update |
| `device_messages` | Raw inbound HL7 + parsed JSON for audit |
| `result_values.notes` | `Norma: 5.5-12.5` snapshot at import time |
| `test_reference_ranges` | Legacy fallback (kept in sync on import) |

---

## Data flow (Norma → database)

1. **Norma** sends ORU^R01 HL7 over TCP to the lab bridge.
2. **Bridge** (`tools/zebra-local-bridge.js`) forwards `POST /api/devices/ingest/:deviceId` with `X-Device-Api-Key`.
3. **`devices.service.processInboundMessage`** stores `raw_message`, calls `parseDeviceMessage`.
4. **`hl7.parseHl7`** walks segments by type (`MSH`, `PID`, `OBR`, `OBX`):
   - **Result** → OBX-5 (`fields[5]`)
   - **Unit** → OBX-6 (`fields[6]`)
   - **Reference Low/High** → OBX-7 (`fields[7]`, parsed by `parseReferenceRange`)
   - **Flag** → OBX-8 (`fields[8]`)
   - **Species** → `PID` / `SPM` / `OBR` CWE fields via `extractAnimalTypeFromSegments`
5. **`device-import.service`** writes CBC values; each value gets `notes: Norma: …` when OBX-7 is present.
6. **`device-reference-ranges.service.syncFromParsedMessage`** upserts into `device_reference_ranges` (never deletes; logs changes).
7. **Reports** (`reports.service.buildReportData`) prefer `referenceFromResultNotes(rv.notes)` over live `device_reference_ranges`.

### Parser robustness

- OBX fields are read by **HL7 standard index**, not by column order in a flat file.
- **Segment order** does not matter: all `OBX` segments are collected regardless of position.
- Species mapping uses `mapNormaSpeciesToRefSpecies`: camel, horse, sheep, goat, cattle, dog, cat, other.

---

## Daily sync

Render cron (`rare-vet-device-refs-sync`, `0 23 * * *` UTC = 02:00 AST) runs:

```bash
node backend/src/scripts/sync-device-reference-ranges.js
```

Re-processes recent `device_messages` to refresh ranges without re-importing results.

---

## Admin UI

`/device-reference-ranges` — lists synced ranges, species filter, change log (requires `DEVICES_VIEW`).

API: `GET /api/devices/reference-ranges/list`

---

## Adding a new analyzer (same pattern)

1. **Device record** — insert into `device_integrations` with `protocol` (`hl7`, `astm`, `csv`) and `config.test_code`.
2. **Parser** — add `backend/src/utils/device-parsers/<vendor>.js` or extend `parseDeviceMessage` detection.
3. **Parameter map** — map vendor codes → LIMS `test_parameters.code` (see `norma-cbc-map.js`).
4. **Species map** — extend `norma-species-map.js` aliases if the device sends species-specific refs.
5. **Reference sync** — call `deviceReferenceRanges.syncFromParsedMessage` from ingest path.
6. **Bridge** — copy `zebra-local-bridge.js` pattern: env `DEVICE_ID`, `DEVICE_API_KEY`, forward raw payload.
7. **Verify** — add cases to `verify-device-reference-ranges.js` and run `production-audit-norma-refs.js`.

---

## Verification scripts

| Script | Purpose |
|--------|---------|
| `node src/scripts/verify-device-reference-ranges.js` | Unit tests: parsers, profile extraction |
| `node src/scripts/production-audit-norma-refs.js` | Production audit: species table, stress test, raw HL7 sample |
| `node src/scripts/fetch-latest-norma-results.js` | DB: latest imports and stored values |

### Production audit

```bash
cd backend
node src/scripts/production-audit-norma-refs.js

# With production DB or API:
DATABASE_URL=postgres://... node src/scripts/production-audit-norma-refs.js
API_URL=https://lims.rarevetcare.com/api ADMIN_PASSWORD=... node src/scripts/production-audit-norma-refs.js
```

Output: `backend/audit-norma-refs-report.json`

---

## Historical reports guarantee

| Scenario | Behavior |
|----------|----------|
| New report after import | Uses `Norma: …` from `result_values.notes` |
| Re-import same sample | Notes preserved on merge when new message has no ref |
| Norma range changes later | Old results keep old notes; old PDFs unchanged |
| Result without Norma notes | Falls back to `device_reference_ranges` → `test_reference_ranges` |

---

## Environment

| Variable | Where | Purpose |
|----------|-------|---------|
| `DEVICE_ID` | Bridge | Norma integration UUID |
| `DEVICE_API_KEY` | Bridge | Ingest authentication |
| `DATABASE_URL` | Render | PostgreSQL |
| Cron `rare-vet-device-refs-sync` | render.yaml | Nightly range sync |
