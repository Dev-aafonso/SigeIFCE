import { describe, expect, it } from '@jest/globals';
import { isTransactionConflict } from './transaction-conflict';
describe('SQLSTATE de concorrencia', () => {
  it.each([
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '40001' } } } },
    { code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '40P01' } } } },
  ])('reconhece %j', (error) => expect(isTransactionConflict(error)).toBe(true));
  it.each([null, {}, { code: 'P2002' }, { code: 'P2010', meta: { code: '23505' } }])('nao repete erros alheios a concorrencia %j', (error) => expect(isTransactionConflict(error)).toBe(false));
});
