// ============================================================================
// RUTA: src/domain/repositories/transaction.ts
// ============================================================================

export type TransactionContext = unknown;

export interface Transactional<TRepository> {
  withTransaction(context: TransactionContext): TRepository;
}

export interface TransactionProvider {
  $transaction<TResult>(
    handler: (context: TransactionContext) => Promise<TResult>,
  ): Promise<TResult>;
}
