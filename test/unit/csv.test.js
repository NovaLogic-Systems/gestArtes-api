const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, UTF8_BOM } = require('../../src/utils/csv');

test('toCsv: starts with UTF-8 BOM', () => {
  const csv = toCsv([], [{ header: 'A', key: 'a' }]);
  assert.ok(csv.startsWith(UTF8_BOM));
});

test('toCsv: empty rows still includes header', () => {
  const csv = toCsv([], [{ header: 'Name', key: 'name' }]);
  assert.ok(csv.includes('Name'));
});

test('toCsv: renders single row', () => {
  const csv = toCsv([{ name: 'Alice' }], [{ header: 'Name', key: 'name' }]);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[1], 'Alice');
});

test('toCsv: escapes commas in values', () => {
  const csv = toCsv([{ name: 'Doe, John' }], [{ header: 'Name', key: 'name' }]);
  assert.ok(csv.includes('"Doe, John"'));
});

test('toCsv: escapes double-quotes by doubling them', () => {
  const csv = toCsv([{ name: 'Say "hi"' }], [{ header: 'Name', key: 'name' }]);
  assert.ok(csv.includes('"Say ""hi"""'));
});

test('toCsv: null values become empty string', () => {
  const csv = toCsv([{ name: null }], [{ header: 'Name', key: 'name' }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '');
});

test('toCsv: undefined values become empty string', () => {
  const csv = toCsv([{}], [{ header: 'Name', key: 'name' }]);
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '');
});

test('toCsv: uses value function when provided', () => {
  const csv = toCsv([{ amount: 10.5 }], [{ header: 'Val', value: (r) => r.amount.toFixed(2) }]);
  assert.ok(csv.includes('10.50'));
});

test('toCsv: multiple columns are comma-separated', () => {
  const csv = toCsv(
    [{ a: '1', b: '2' }],
    [{ header: 'A', key: 'a' }, { header: 'B', key: 'b' }]
  );
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], `${UTF8_BOM}A,B`);
  assert.equal(lines[1], '1,2');
});

test('toCsv: throws when columns array is empty', () => {
  assert.throws(() => toCsv([], []), /non-empty/);
});

test('toCsv: Date values are serialized via toISOString', () => {
  const d = new Date('2026-04-22T10:00:00.000Z');
  const csv = toCsv([{ date: d }], [{ header: 'Date', key: 'date' }]);
  assert.ok(csv.includes('2026-04-22T10:00:00.000Z'));
});
