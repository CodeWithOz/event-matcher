/** Whether a MongoDB error is a unique-index violation (E11000), including in bulk writes. */
export function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}
