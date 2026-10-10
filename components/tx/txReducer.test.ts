import { describe, expect, test } from 'vitest';
import { UserRejectedRequestError } from 'viem';
import { isUserRejection, txReducer, type TxState } from './txReducer';

const HASH = '0xabc0000000000000000000000000000000000000000000000000000000000001' as const;
const idle: TxState = { status: 'idle' };

describe('txReducer', () => {
  test('success only after a success receipt', () => {
    let s = txReducer(idle, { type: 'start' });
    expect(s.status).toBe('awaiting_signature');
    s = txReducer(s, { type: 'signed', hash: HASH, at: 1000 });
    expect(s).toEqual({ status: 'pending', hash: HASH, sentAt: 1000 });
    s = txReducer(s, { type: 'receipt', status: 'success', block: 10n, at: 1600 });
    expect(s).toEqual({ status: 'confirmed', hash: HASH, block: 10n, seconds: 0.6 });
  });

  test('a signature alone is never confirmed', () => {
    const s = txReducer(txReducer(idle, { type: 'start' }), { type: 'signed', hash: HASH, at: 5 });
    expect(s.status).toBe('pending');
  });

  test('user rejection → cancelled, never confirmed', () => {
    const s = txReducer(
      { status: 'awaiting_signature' },
      { type: 'error', err: new UserRejectedRequestError(new Error('User rejected')) },
    );
    expect(s).toEqual({ status: 'cancelled' });
  });

  test('rejection wrapped in a cause chain is still a cancel', () => {
    const wrapped = Object.assign(new Error('write failed'), { cause: { code: 4001, message: 'x' } });
    expect(isUserRejection(wrapped)).toBe(true);
    expect(txReducer({ status: 'awaiting_signature' }, { type: 'error', err: wrapped })).toEqual({ status: 'cancelled' });
  });

  test('reverted receipt → failed and keeps the hash', () => {
    const pending: TxState = { status: 'pending', hash: HASH, sentAt: 0 };
    const s = txReducer(pending, { type: 'receipt', status: 'reverted', block: 11n, at: 900 });
    expect(s.status).toBe('failed');
    expect(s).toMatchObject({ hash: HASH });
  });

  test('wallet error that is not a rejection → failed with the short reason', () => {
    const err = Object.assign(new Error('long'), { shortMessage: 'The contract function "deposit" reverted: NotAdmin' });
    const s = txReducer({ status: 'awaiting_signature' }, { type: 'error', err });
    expect(s).toEqual({ status: 'failed', reason: 'The contract function "deposit" reverted: NotAdmin' });
  });

  test('error while waiting for the receipt → failed with the hash', () => {
    const pending: TxState = { status: 'pending', hash: HASH, sentAt: 0 };
    const s = txReducer(pending, { type: 'error', err: new Error('timed out') });
    expect(s).toEqual({ status: 'failed', hash: HASH, reason: 'timed out' });
  });

  test('a receipt with no pending tx is ignored', () => {
    expect(txReducer(idle, { type: 'receipt', status: 'success', block: 1n, at: 1 })).toEqual(idle);
    expect(txReducer({ status: 'awaiting_signature' }, { type: 'receipt', status: 'success', block: 1n, at: 1 })).toEqual({
      status: 'awaiting_signature',
    });
  });

  test('reset returns to idle', () => {
    expect(txReducer({ status: 'cancelled' }, { type: 'reset' })).toEqual(idle);
  });
});
