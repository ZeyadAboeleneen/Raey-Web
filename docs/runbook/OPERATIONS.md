# 📖 Operator Runbook: System Maintenance & Incident Response

This document provides the standard operating procedures (SOP) for managing the Raey-Web Event-Driven Architecture.

---

## 🏥 Health Monitoring
**Endpoint**: `/api/admin/system/health`
- **HEALTHY**: All systems normal.
- **WARNING**: Pending events > 100 or latency > 5s. Action: Monitor worker logs.
- **CRITICAL**: Invariant violations detected. **ACTION REQUIRED IMMEDIATELY.**

---

## 🚨 Incident Response

### 1. Stuck Event Backlog (PENDING status growing)
- **Symptom**: `pendingCount` increases rapidly; latency rises.
- **Root Cause**: Worker crashed or is processing a heavy batch.
- **Action**: Check `lib/worker-init.ts` and ensure the interval is firing. Restart the server if necessary.

### 2. Dead Letter Queue (FAILED status)
- **Symptom**: `recentFailures` in Health API shows events with `attempts >= 5`.
- **Action**:
    1. Check `lastError` in the OutboxEvent table.
    2. If it's a code bug (e.g., `INVALID_EVENT_SCHEMA`), fix the code first.
    3. To retry, manually reset `status` to `PENDING` and `attempts` to `0`.

### 3. Invariant Violation (STUCK_PROCESSING)
- **Symptom**: Events stuck in `PROCESSING` for > 10m.
- **Root Cause**: A worker node died mid-execution.
- **Action**: Identify the event ID. Verify if the side-effect (e.g., Audit) actually happened. If not, reset the status to `PENDING`.

---

## 🔄 Replay & Recovery
- **Procedure**: Use `EventReplayService.replayEvent(id)` via an administrative script.
- **Safety**: The system is idempotent. Replaying an event is safe and will not create duplicate data if the `eventId` unique constraint is respected.

---

## ⛔ Forbidden Operations
- **DO NOT** delete records from `outbox_events` manually unless they are > 30 days old.
- **DO NOT** bypass the `withPipeline` for any state-changing admin request.
- **DO NOT** perform direct SQL updates on `audit_logs` without a corresponding ADR.

---
**Standard Response Time**: Incidents labeled **CRITICAL** should be acknowledged within 1 hour.
