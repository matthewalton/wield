import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDimensions } from './format.ts';

test('accepts strings and lists of strings', () => {
  const { dimensions, diagnostics } = validateDimensions(
    { category: 'plan', tags: ['experimental', 'slow'] },
    'meta.yaml',
  );
  assert.deepEqual(dimensions, { category: 'plan', tags: ['experimental', 'slow'] });
  assert.equal(diagnostics.length, 0);
});

test('an empty sidecar is valid and carries no dimensions', () => {
  // Presence is what opts a skill into enriched tracking, not content.
  for (const empty of [null, undefined]) {
    const { dimensions, diagnostics } = validateDimensions(empty, 'meta.yaml');
    assert.deepEqual(dimensions, {});
    assert.equal(diagnostics.length, 0);
  }
});

test('rejects numbers, booleans and nested maps, keeping the valid keys', () => {
  const { dimensions, diagnostics } = validateDimensions(
    { category: 'plan', cost: 3, stable: true, owner: { name: 'sarah' } },
    'meta.yaml',
  );
  assert.deepEqual(dimensions, { category: 'plan' });
  assert.equal(diagnostics.length, 3);
  assert.ok(diagnostics.every((d) => d.level === 'error'));
});

test('rejects a list with a non-string member', () => {
  const { dimensions, diagnostics } = validateDimensions({ tags: ['plan', 7] }, 'meta.yaml');
  assert.deepEqual(dimensions, {});
  assert.match(diagnostics[0]!.message, /every member must be a string/);
});

test('rejects a sidecar that is not a map', () => {
  const { diagnostics } = validateDimensions(['plan'], 'meta.yaml');
  assert.match(diagnostics[0]!.message, /must be a key → value map/);
});

test('unknown keys are never errors', () => {
  const { dimensions, diagnostics } = validateDimensions({ whatever: 'yes' }, 'meta.yaml');
  assert.deepEqual(dimensions, { whatever: 'yes' });
  assert.equal(diagnostics.length, 0);
});
