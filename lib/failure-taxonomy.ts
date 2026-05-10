/**
 * System Failure Taxonomy: The official classification of errors.
 */

export type ErrorSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
export type ErrorCategory = "INFRASTRUCTURE" | "DOMAIN" | "EXTERNAL" | "PROGRAMMER_ERROR"

export interface SystemError {
  code: string
  category: ErrorCategory
  severity: ErrorSeverity
  isRetryable: boolean
  action: string
}

export const ERROR_TAXONOMY: Record<string, SystemError> = {
  // --- OUTBOX ERRORS ---
  "OUTBOX_LOCK_TIMEOUT": {
    code: "OUTBOX_LOCK_TIMEOUT",
    category: "INFRASTRUCTURE",
    severity: "HIGH",
    isRetryable: true,
    action: "WAIT_AND_RETRY"
  },
  "INVALID_EVENT_SCHEMA": {
    code: "INVALID_EVENT_SCHEMA",
    category: "PROGRAMMER_ERROR",
    severity: "CRITICAL",
    isRetryable: false,
    action: "FIX_CODE_IMMEDIATELY"
  },
  "EVENT_RETRY_EXHAUSTED": {
    code: "EVENT_RETRY_EXHAUSTED",
    category: "INFRASTRUCTURE",
    severity: "HIGH",
    isRetryable: false,
    action: "MANUAL_RECONCILIATION"
  },

  // --- AUDIT ERRORS ---
  "AUDIT_DUPLICATE_EVENT": {
    code: "AUDIT_DUPLICATE_EVENT",
    category: "DOMAIN",
    severity: "LOW",
    isRetryable: false,
    action: "IGNORE_DEDUPLICATED"
  },

  // --- BOOTSTRAP ERRORS ---
  "SCHEMA_MISMATCH": {
    code: "SCHEMA_MISMATCH",
    category: "INFRASTRUCTURE",
    severity: "CRITICAL",
    isRetryable: false,
    action: "SYNC_DATABASE_SCHEMA"
  },
  "STUCK_STATE_AT_STARTUP": {
    code: "STUCK_STATE_AT_STARTUP",
    category: "INFRASTRUCTURE",
    severity: "CRITICAL",
    isRetryable: false,
    action: "RESET_STUCK_PROCESSES"
  }
}

/**
 * Utility to format errors for structured logging.
 */
export function classifyError(code: string, originalMessage: string) {
  const meta = ERROR_TAXONOMY[code] || {
    code: "UNKNOWN_ERROR",
    category: "DOMAIN",
    severity: "MEDIUM",
    isRetryable: true,
    action: "RETRY_BY_DEFAULT"
  }
  return {
    ...meta,
    timestamp: new Date().toISOString(),
    originalMessage
  }
}
