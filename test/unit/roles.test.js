const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROLE_HIERARCHY,
  getHighestPriorityRole,
  toAppRole,
} = require('../../src/utils/roles');

test('toAppRole maps Direction to admin', () => {
  assert.equal(toAppRole('Direction'), 'admin');
});

test('toAppRole maps Direção to admin', () => {
  assert.equal(toAppRole('Direção'), 'admin');
});

test('toAppRole maps Management to admin', () => {
  assert.equal(toAppRole('Management'), 'admin');
});

test('getHighestPriorityRole prefers admin over lower roles', () => {
  assert.equal(getHighestPriorityRole(['Aluno', 'Direção']), 'admin');
  assert.equal(ROLE_HIERARCHY.admin > ROLE_HIERARCHY.teacher, true);
});
