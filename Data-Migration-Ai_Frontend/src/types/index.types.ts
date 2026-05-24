/** Single field-level error returned inside {@link ApiErrorBody}. */
export type ApiFieldError = {
  /** Field path that failed (e.g. `"data"`, `"$.year"`). */
  field: string;
  /** One or more validation messages for this field. */
  messages: string[];
};

/**
 * Nested error body the backend returns inside {@link ApiResponse} when `success` is false.
 * Present on every failed API call — not limited to form validation.
 */
export type ApiErrorBody = {
  /** Error category code (e.g. `"VALIDATION_ERROR"`). */
  code: string | null;
  /** Human-readable summary — highest priority for toast display. */
  message: string | null;
  /** Optional additional detail string. */
  detail: string | null;
  /** Optional extended error payload. */
  extended: unknown;
  /** Field-level error list — loop over this to show per-field messages in the UI. */
  errors: ApiFieldError[] | null;
};


/**
 * Standard response envelope returned by every backend endpoint.
 * Unwrap `data` for the actual payload; check `success` before using it.
 */
export type ApiResponse<T> = {
  /** `true` = OK, `false` = application-level error — always check this before using `data`. */
  success: boolean;
  /** User-facing message — highest priority for toast display when present. */
  message: string | null;
  /** Structured error body — present whenever `success` is false. */
  error: ApiErrorBody | null;
  /** Actual response payload — valid only when `success` is true. */
  data: T;
};
