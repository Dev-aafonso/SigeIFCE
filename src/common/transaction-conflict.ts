/** Prisma pode expor SQLSTATE de queryRaw como P2010, em vez de P2034. */
export function isTransactionConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const value = error as { code?: unknown; meta?: { code?: unknown;
    driverAdapterError?: { cause?: { originalCode?: unknown } } } };
  const sqlState = value.meta?.code ?? value.meta?.driverAdapterError?.cause?.originalCode;
  return value.code === 'P2034' || (value.code === 'P2010' &&
    (sqlState === '40001' || sqlState === '40P01'));
}
