const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const missingEnv = ['DATABASE_URL', 'TEST_LOGIN_EMAIL', 'TEST_LOGIN_PASSWORD'].filter((key) => !process.env[key]);

if (!shouldRun) {
  test('Marketplace integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true', { skip: true }, () => {});
} else if (missingEnv.length > 0) {
  test(
    `Marketplace integration tests are skipped due to missing env vars: ${missingEnv.join(', ')}`,
    { skip: true },
    () => {}
  );
} else {
  const app = require('../../src/app');
  const prisma = require('../../src/config/prisma');

  let server;
  let baseUrl = '';
  let sessionCookie = '';
  let createdListingId = null;

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

  test.before(async () => {
    server = app.listen(0);

    await new Promise((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

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

    assert.equal(loginResponse.status, 200, 'Falha no login de teste para marketplace');
  });

  test.after(async () => {
    if (createdListingId !== null) {
      await prisma.marketplaceItem.updateMany({
        where: {
          MarketplaceItemID: createdListingId,
        },
        data: {
          IsActive: false,
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

  test('marketplace endpoints support filters, detail, ownership flow and soft-delete', async (t) => {
    const condition = await prisma.marketplaceItemCondition.findFirst({
      orderBy: {
        ConditionID: 'asc',
      },
    });

    if (!condition) {
      t.skip('No marketplace item conditions available for integration testing');
      return;
    }

    const category = await prisma.itemCategory.findFirst({
      where: {
        IsActive: true,
      },
      orderBy: {
        CategoryID: 'asc',
      },
    });

    const uniqueSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const createPayload = {
      title: `Marketplace test listing ${uniqueSuffix}`,
      description: 'Listing created by integration test',
      price: 15,
      conditionId: condition.ConditionID,
      photoUrl: '/uploads/marketplace/test-item.jpg',
      location: 'Viana do Castelo',
    };

    if (category) {
      createPayload.categoryId = category.CategoryID;
    }

    const createResponse = await request('/marketplace/listings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    });

    assert.equal(createResponse.status, 201, 'POST /marketplace/listings should create a listing');

    const createBody = await createResponse.json();
    createdListingId = createBody.listing?.listingId;
    assert.ok(createdListingId, 'Created listing should return listingId');

    const listQuery = new URLSearchParams({
      minPrice: '10',
      maxPrice: '25',
      location: 'Viana',
    });

    if (category) {
      listQuery.set('category', String(category.CategoryID));
    }

    const listResponse = await request(`/marketplace/listings?${listQuery.toString()}`);
    assert.equal(listResponse.status, 200, 'GET /marketplace/listings should succeed');

    const listBody = await listResponse.json();
    assert.ok(Array.isArray(listBody.listings), 'Listings response should be an array');
    assert.ok(
      listBody.listings.some((listing) => listing.listingId === createdListingId),
      'Created listing should be returned in filtered list'
    );

    const detailResponse = await request(`/marketplace/listings/${createdListingId}`);
    assert.equal(detailResponse.status, 200, 'GET /marketplace/listings/:id should succeed');

    const detailBody = await detailResponse.json();
    assert.equal(detailBody.listing.listingId, createdListingId);
    assert.ok(detailBody.listing.seller, 'Listing detail should include seller object');
    assert.ok(
      Object.prototype.hasOwnProperty.call(detailBody.listing.seller, 'email'),
      'Listing detail should include seller contact email'
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(detailBody.listing.seller, 'phoneNumber'),
      'Listing detail should include seller contact phone number'
    );

    const myListingsResponse = await request('/marketplace/my-listings');
    assert.equal(myListingsResponse.status, 200, 'GET /marketplace/my-listings should succeed');

    const myListingsBody = await myListingsResponse.json();
    assert.ok(
      myListingsBody.listings.some((listing) => listing.listingId === createdListingId),
      'Created listing should be visible in my listings'
    );

    const updatedTitle = `Marketplace updated ${uniqueSuffix}`;
    const updateResponse = await request(`/marketplace/listings/${createdListingId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: updatedTitle,
      }),
    });

    assert.equal(updateResponse.status, 200, 'PATCH /marketplace/listings/:id should succeed');

    const updateBody = await updateResponse.json();
    assert.equal(updateBody.listing.title, updatedTitle);

    const deleteResponse = await request(`/marketplace/listings/${createdListingId}`, {
      method: 'DELETE',
    });

    assert.equal(deleteResponse.status, 204, 'DELETE /marketplace/listings/:id should return 204');

    const afterDeleteResponse = await request(`/marketplace/listings/${createdListingId}`);
    assert.equal(
      afterDeleteResponse.status,
      404,
      'Deleted listing should no longer be visible in active listing detail endpoint'
    );

    createdListingId = null;
  });
}
