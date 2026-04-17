const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const missingEnv = ['DATABASE_URL', 'TEST_LOGIN_EMAIL', 'TEST_LOGIN_PASSWORD'].filter((key) => !process.env[key]);

if (!shouldRun) {
  test('Inventory integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true', { skip: true }, () => {});
} else if (missingEnv.length > 0) {
  test(
    `Inventory integration tests are skipped due to missing env vars: ${missingEnv.join(', ')}`,
    { skip: true },
    () => {}
  );
} else {
  const app = require('../../src/app');
  const prisma = require('../../src/config/prisma');

  let server;
  let baseUrl = '';
  let sessionCookie = '';
  let createdRentalId = null;

  async function request(path, options = {}) {
    const headers = {
      ...(options.headers || {}),
    };

    if (sessionCookie) {
      headers.Cookie = sessionCookie;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });

    const setCookieHeader =
      (typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()[0]
        : null) || response.headers.get('set-cookie');

    if (setCookieHeader) {
      sessionCookie = setCookieHeader.split(';')[0];
    }

    return response;
  }

  async function loginAsStudent() {
    const loginResponse = await request('/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: process.env.TEST_LOGIN_EMAIL,
        password: process.env.TEST_LOGIN_PASSWORD,
      }),
    });

    assert.equal(loginResponse.status, 200, 'Falha no login de teste para inventory');

    const body = await loginResponse.json();
    const role = String(body.user?.role || '').toLowerCase();

    if (role !== 'student') {
      return false;
    }

    return true;
  }

  test.before(async () => {
    server = app.listen(0);

    await new Promise((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  test.after(async () => {
    if (createdRentalId !== null) {
      await prisma.inventoryTransaction.deleteMany({
        where: {
          TransactionID: createdRentalId,
        },
      });
    }

    await prisma.$disconnect();

    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });

  test('inventory student flow supports item browse, detail, rental create and history', async (t) => {
    const isStudent = await loginAsStudent();

    if (!isStudent) {
      t.skip('Configured integration test user is not a student role');
      return;
    }

    const itemsResponse = await request('/inventory/items?availableOnly=true');
    assert.equal(itemsResponse.status, 200, 'GET /inventory/items should succeed');

    const itemsBody = await itemsResponse.json();
    assert.ok(Array.isArray(itemsBody.items), 'Items should be returned as array');
    assert.ok(itemsBody.items.length > 0, 'At least one rentable inventory item is required for integration test');

    const targetItem = itemsBody.items[0];

    const detailResponse = await request(`/inventory/items/${targetItem.itemId}`);
    assert.equal(detailResponse.status, 200, 'GET /inventory/items/:id should succeed');

    const detailBody = await detailResponse.json();
    assert.equal(detailBody.item.itemId, targetItem.itemId, 'Item detail should match requested id');

    const paymentMethod = await prisma.paymentMethod.findFirst({
      orderBy: {
        PaymentMethodID: 'asc',
      },
      select: {
        PaymentMethodID: true,
      },
    });

    if (!paymentMethod) {
      t.skip('No payment methods found in database for inventory rental creation test');
      return;
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime());
    endDate.setDate(endDate.getDate() + 4);

    const createResponse = await request('/inventory/rentals', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inventoryItemId: targetItem.itemId,
        paymentMethodId: paymentMethod.PaymentMethodID,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      }),
    });

    assert.equal(createResponse.status, 201, 'POST /inventory/rentals should create a rental request');

    const createBody = await createResponse.json();
    createdRentalId = createBody.rental?.rentalId;

    assert.ok(createdRentalId, 'Created rental should return rentalId');
    assert.equal(createBody.checkoutSummary?.paymentFlow, 'offline', 'Checkout summary should indicate offline payment flow');
    assert.ok(createBody.checkoutSummary?.reference, 'Checkout summary should include reference');

    const rentalsResponse = await request('/inventory/rentals');
    assert.equal(rentalsResponse.status, 200, 'GET /inventory/rentals should succeed');

    const rentalsBody = await rentalsResponse.json();
    assert.ok(Array.isArray(rentalsBody.rentals), 'Rentals should be returned as array');
    assert.ok(
      rentalsBody.rentals.some((rental) => rental.rentalId === createdRentalId),
      'Created rental should be visible in student rental history'
    );

    createdRentalId = null;
  });
}