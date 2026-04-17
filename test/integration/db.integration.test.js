const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const missingEnv = ['DATABASE_URL'].filter(key => !process.env[key]);
const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

if (!shouldRun) {
  test('DB integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true', { skip: true }, () => {});
} else if (missingEnv.length > 0) {
  test(`DB integration tests are skipped due to missing env vars: ${missingEnv.join(', ')}`, { skip: true }, () => {});
} else {
  const prisma = require('../../src/config/prisma');

  test.after(async () => {
    await prisma.$disconnect();
  });

  test('connectivity: database responds to SELECT 1', async () => {
    const result = await prisma.$queryRaw`SELECT 1 AS health`;
    assert.equal(result[0].health, 1);
  });
}
