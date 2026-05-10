# 📜 V1 System Contracts (Architectural Freeze)

These schemas are the "Fixed Points" of our architecture. Any change to these structures requires a major version increment and an ADR.

---

## 1. Outbox Event Schema (V1)
Every event enqueued in the system MUST adhere to the following Zod registry:
- **Location**: `lib/schemas/events.schema.ts`
- **Fields**:
    - `id`: UUID (Auto-generated)
    - `type`: Enum (AUDIT_LOG | ERP_SYNC | etc.)
    - `payload`: JSON (Validated per type)
    - `status`: Enum (PENDING | PROCESSING | COMPLETED | FAILED)

---

## 2. Audit Log Schema (V1)
- **Primary Key**: `id` (UUID)
- **Determinism Key**: `eventId` (UUID, UNIQUE)
- **Structure**:
    - `action`: String (e.g., 'LOGIN_SUCCESS')
    - `actorId`: String?
    - `entityId`: String?
    - `metadata`: JSON (Request/Browser info)

---

## 3. Health API Response (V1)
The Health API must always return a JSON object with:
- `health`: Enum (HEALTHY | WARNING | CRITICAL)
- `violations`: Array of Strings
- `latency`: { averageLagMs: Number, unit: "milliseconds" }
- `pendingCount`: Number

---

## 4. Failure Taxonomy (V1)
- **Location**: `lib/failure-taxonomy.ts`
- **Required Fields**: `code`, `category`, `severity`, `isRetryable`.

---
**Status**: FROZEN (2026-05-10)
**Policy**: No internal logic change shall modify these field names without deprecation notice.
