export class CancelledError extends Error {
  constructor(message = 'Operation cancelled') {
    super(message)
    this.name = 'CancelledError'
  }
}

export function isCancelled(e: unknown): boolean {
  return e instanceof CancelledError || (e as { name?: string } | null)?.name === 'CancelledError'
}

export function throwIfCancelled(
  signal: AbortSignal | undefined,
  message = 'Operation cancelled',
): void {
  if (signal?.aborted) throw new CancelledError(message)
}
