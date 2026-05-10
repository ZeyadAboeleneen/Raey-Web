# ADR-001: Dumb Pipeline (Lightweight Security Layer)

## Context
The request pipeline (`withPipeline`) was becoming a "Smart Pipeline" by handling audit logging, chaos testing, and complex business side effects. This led to tight coupling and high cognitive load for developers.

## Decision
We decided to strip the pipeline of all business and infrastructure logic. It now acts as a "Dumb Guard" focused exclusively on:
1.  **Security Handshake** (CSRF, Origin).
2.  **Authentication & RBAC**.
3.  **Transport-level Idempotency Keys**.

## Consequences
- **Positive**: High scalability, easier testing, and clear separation of concerns.
- **Negative**: Handlers must now explicitly manage their own side effects (e.g., calling OutboxService).

---

# ADR-002: No Outbox for Login Events

## Context
Initially, even simple session-level events like "Login Success" were being enqueued in the Outbox.

## Decision
We decided to exclude session-level activities from the Outbox. Only "State-changing cross-system operations" (e.g., Employee Creation, ERP Sync) deserve an Outbox entry. Login events are now handled via direct, high-performance auditing.

## Consequences
- **Positive**: Reduced latency in the authentication path and lower noise in the event stream.
- **Negative**: Login audits are not covered by the Outbox's retry/recovery guarantees.

---

# ADR-003: Database as the Single Source of Truth

## Context
Multiple layers (Cache, Audit, Outbox) were being treated as "Truth", leading to confusion during failures.

## Decision
We formally declared the **Main MySQL Database** as the only Source of Truth. Outbox and Audit logs are classified as "Evidence". 

## Consequences
- **Positive**: Absolute clarity on system state during debugging and reconciliation.
- **Negative**: All critical state changes must happen within a database transaction.

---

# ADR-004: At-Least-Once Event Delivery

## Context
Guaranteeing "Exactly-Once" delivery in a distributed system is complex and expensive.

## Decision
We adopted **At-Least-Once** delivery semantics combined with **Deterministic Idempotency**.
- The Outbox worker may process an event multiple times (retries).
- The target systems (Audit/ERP) must deduplicate using unique constraints (e.g., `AuditLog.event_id`).

## Consequences
- **Positive**: High resilience and simplicity in the worker logic.
- **Negative**: Target tables must support unique event identifiers to prevent duplicates.
