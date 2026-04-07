const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const requiredEnv = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

if (!shouldRun) {
  test('DB integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true', { skip: true }, () => {});
} else if (missingEnv.length > 0) {
  test(`DB integration tests are skipped due to missing env vars: ${missingEnv.join(', ')}`, { skip: true }, () => {});
} else {
  const { query } = require('../../src/config/db');

  test('connectivity: database responds to SELECT 1', async () => {
    const result = await query('SELECT 1 AS health');
    assert.equal(result.recordset[0].health, 1);
  });

  test('CRUD: insert, read, update, delete using parameterized queries', async () => {
    const result = await query(
      `
      CREATE TABLE #crud_test (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL
      );

      INSERT INTO #crud_test (name)
      VALUES (@insertName);

      SELECT id, name
      FROM #crud_test
      WHERE name = @insertName;

      UPDATE #crud_test
      SET name = @updatedName
      WHERE id = 1;

      SELECT id, name
      FROM #crud_test
      WHERE id = 1;

      DELETE FROM #crud_test
      WHERE id = 1;

      SELECT COUNT(1) AS total
      FROM #crud_test;
      `,
      {
        insertName: 'integration-user',
        updatedName: 'integration-user-updated',
      },
    );

    const inserted = result.recordsets[0][0];
    const updated = result.recordsets[1][0];
    const afterDelete = result.recordsets[2][0];

    assert.equal(inserted.name, 'integration-user');
    assert.equal(updated.name, 'integration-user-updated');
    assert.equal(afterDelete.total, 0);
  });
}
