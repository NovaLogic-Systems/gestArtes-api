/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROLE_EQUIVALENCE_HINTS,
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

test('toAppRole maps mixed functional management labels to admin', () => {
  assert.equal(toAppRole('Direção / Gestão'), 'admin');
  assert.equal(toAppRole('Management / Coordination'), 'admin');
});

test('admin equivalence hints explicitly include direction and management terms', () => {
  assert.equal(ROLE_EQUIVALENCE_HINTS.admin.includes('direction'), true);
  assert.equal(ROLE_EQUIVALENCE_HINTS.admin.includes('management'), true);
});

test('getHighestPriorityRole prefers admin over lower roles', () => {
  assert.equal(getHighestPriorityRole(['Aluno', 'Direção']), 'admin');
  assert.equal(ROLE_HIERARCHY.admin > ROLE_HIERARCHY.teacher, true);
});
