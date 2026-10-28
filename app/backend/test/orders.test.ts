import assert from 'node:assert/strict';
import test from 'node:test';
import { validateOrder } from '../src/orders.js';
import { allowedCorsOrigins } from '../src/app.js';

test('validateOrder accepts bounded synthetic data', () => {
  const result = validateOrder({ customerRef: 'DEMO-TEST-001', items: [{ sku: 'TRACE-KIT', quantity: 2, unitPrice: 12.5 }] });
  assert.equal(result.items[0]?.quantity, 2);
});

test('validateOrder rejects a non-synthetic customer reference', () => {
  assert.throws(() => validateOrder({ customerRef: 'Alice', items: [{ sku: 'TRACE-KIT', quantity: 1, unitPrice: 1 }] }), /synthetic/);
});

test('validateOrder rejects unbounded item counts', () => {
  assert.throws(() => validateOrder({ customerRef: 'DEMO-TEST', items: [] }), /1 to 20/);
});

test('CORS uses explicit deployment origins when configured', () => {
  assert.deepEqual(allowedCorsOrigins('http://demo.example, https://secure.example '), ['http://demo.example', 'https://secure.example']);
});

test('CORS does not fall back to a wildcard', () => {
  const origins = allowedCorsOrigins('');
  assert.equal(origins.length, 1);
  assert.ok(origins[0] instanceof RegExp);
  assert.equal(origins[0].test('http://localhost:5173'), true);
  assert.equal(origins[0].test('https://untrusted.example'), false);
});
