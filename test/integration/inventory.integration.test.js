const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const Module = require('node:module');

const BASE_INVENTORY_ITEMS = [
  {
    InventoryItemID: 1,
    ItemName: 'Figurino Classico Lote B',
    CategoryID: 1,
    SymbolicFee: 5,
    Description: 'Traje para apresentacoes',
    PhotoURL: '/uploads/inventory/1.jpg',
    TotalQuantity: 2,
    ItemCategory: {
      CategoryID: 1,
      CategoryName: 'Figurino',
    },
  },
  {
    InventoryItemID: 2,
    ItemName: 'Painel Cenico Modular',
    CategoryID: 2,
    SymbolicFee: 9,
    Description: 'Painel para cenografia',
    PhotoURL: '/uploads/inventory/2.jpg',
    TotalQuantity: 1,
    ItemCategory: {
      CategoryID: 2,
      CategoryName: 'Cenario',
    },
  },
];

const BASE_PAYMENT_METHODS = [
  {
    PaymentMethodID: 1,
    MethodName: 'MB Way',
    IsActive: true,
  },
  {
    PaymentMethodID: 2,
    MethodName: 'Cartao',
    IsActive: false,
  },
];

let inventoryItems = [];
let paymentMethods = [];
let inventoryTransactions = [];
let nextTransactionId = 900;
let transactionQueue = Promise.resolve();

function cloneInventoryItem(item) {
  return {
    ...item,
    ItemCategory: item.ItemCategory
      ? {
        ...item.ItemCategory,
      }
      : null,
  };
}

function clonePaymentMethod(method) {
  return {
    ...method,
  };
}

function cloneInventoryTransaction(transaction) {
  return {
    ...transaction,
    StartDate: transaction.StartDate ? new Date(transaction.StartDate) : null,
    EndDate: transaction.EndDate ? new Date(transaction.EndDate) : null,
  };
}

function pickSelectedFields(record, select) {
  if (!select) {
    return record;
  }

  const selected = {};

  for (const [field, enabled] of Object.entries(select)) {
    if (enabled === true && Object.prototype.hasOwnProperty.call(record, field)) {
      selected[field] = record[field];
    }
  }

  return selected;
}

function resetData() {
  inventoryItems = BASE_INVENTORY_ITEMS.map(cloneInventoryItem);
  paymentMethods = BASE_PAYMENT_METHODS.map(clonePaymentMethod);
  inventoryTransactions = [
    {
      TransactionID: 500,
      InventoryItemID: 1,
      RenterID: 71,
      StartDate: new Date('2026-04-10T10:00:00.000Z'),
      EndDate: new Date('2026-04-20T10:00:00.000Z'),
      PaymentMethodID: 1,
      IsCompleted: false,
      ConditionChecked: false,
      ReturnVerified: false,
    },
    {
      TransactionID: 501,
      InventoryItemID: 2,
      RenterID: 72,
      StartDate: new Date('2026-04-12T10:00:00.000Z'),
      EndDate: null,
      PaymentMethodID: 1,
      IsCompleted: false,
      ConditionChecked: false,
      ReturnVerified: false,
    },
  ];
  nextTransactionId = 900;
  transactionQueue = Promise.resolve();
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesInventoryItemWhere(item, where = {}) {
  if (where.CategoryID !== undefined && item.CategoryID !== where.CategoryID) {
    return false;
  }

  const categoryNameFilter = where.ItemCategory?.CategoryName;
  if (categoryNameFilter) {
    const itemCategoryName = normalizeString(item.ItemCategory?.CategoryName);
    if (itemCategoryName !== normalizeString(categoryNameFilter)) {
      return false;
    }
  }

  return true;
}

function matchesInventoryTransactionWhere(transaction, where = {}) {
  if (where.IsCompleted !== undefined && transaction.IsCompleted !== where.IsCompleted) {
    return false;
  }

  if (
    where.InventoryItemID !== undefined
    && typeof where.InventoryItemID === 'number'
    && transaction.InventoryItemID !== where.InventoryItemID
  ) {
    return false;
  }

  if (where.InventoryItemID && typeof where.InventoryItemID === 'object' && Array.isArray(where.InventoryItemID.in)) {
    if (!where.InventoryItemID.in.includes(transaction.InventoryItemID)) {
      return false;
    }
  }

  return true;
}

const fakePrisma = {
  $transaction: async (callback, options = {}) => {
    if (String(options.isolationLevel) === 'Serializable') {
      const queued = transactionQueue.then(() => callback(fakePrisma), () => callback(fakePrisma));
      transactionQueue = queued.then(() => undefined, () => undefined);
      return queued;
    }

    return callback(fakePrisma);
  },
  $queryRaw: async (strings, ...values) => {
    const inventoryItemId = Number(values[0]);
    const item = inventoryItems.find((entry) => entry.InventoryItemID === inventoryItemId);

    if (!item) {
      return [];
    }

    return [
      {
        InventoryItemID: item.InventoryItemID,
        ItemName: item.ItemName,
        SymbolicFee: item.SymbolicFee,
        TotalQuantity: item.TotalQuantity,
      },
    ];
  },
  inventoryItem: {
    findMany: async ({ where = {} } = {}) => {
      return inventoryItems
        .filter((item) => matchesInventoryItemWhere(item, where))
        .sort((a, b) => a.ItemName.localeCompare(b.ItemName))
        .map(cloneInventoryItem);
    },
    findUnique: async ({ where, select } = {}) => {
      const item = inventoryItems.find((entry) => entry.InventoryItemID === where.InventoryItemID);
      if (!item) {
        return null;
      }

      const cloned = cloneInventoryItem(item);
      return pickSelectedFields(cloned, select);
    },
  },
  paymentMethod: {
    findUnique: async ({ where, select } = {}) => {
      const method = paymentMethods.find((entry) => entry.PaymentMethodID === where.PaymentMethodID);
      if (!method) {
        return null;
      }

      const cloned = clonePaymentMethod(method);
      return pickSelectedFields(cloned, select);
    },
  },
  inventoryTransaction: {
    groupBy: async ({ where = {} } = {}) => {
      const grouped = new Map();

      for (const transaction of inventoryTransactions) {
        if (!matchesInventoryTransactionWhere(transaction, where)) {
          continue;
        }

        const current = grouped.get(transaction.InventoryItemID) || 0;
        grouped.set(transaction.InventoryItemID, current + 1);
      }

      return [...grouped.entries()].map(([InventoryItemID, total]) => ({
        InventoryItemID,
        _count: {
          _all: total,
        },
      }));
    },
    count: async ({ where = {} } = {}) => {
      return inventoryTransactions.filter((transaction) => matchesInventoryTransactionWhere(transaction, where)).length;
    },
    create: async ({ data }) => {
      const created = {
        TransactionID: nextTransactionId,
        InventoryItemID: data.InventoryItemID,
        RenterID: data.RenterID,
        StartDate: data.StartDate ? new Date(data.StartDate) : null,
        EndDate: data.EndDate ? new Date(data.EndDate) : null,
        PaymentMethodID: data.PaymentMethodID,
        IsCompleted: data.IsCompleted,
        ConditionChecked: data.ConditionChecked,
        ReturnVerified: data.ReturnVerified,
      };

      nextTransactionId += 1;
      inventoryTransactions.push(created);

      return cloneInventoryTransaction(created);
    },
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../config/prisma') {
    return fakePrisma;
  }

  return originalLoad.call(this, request, parent, isMain);
};

let inventoryRoutes;
let errorHandler;

try {
  inventoryRoutes = require('../../src/routes/inventory.routes');
  errorHandler = require('../../src/middlewares/error.middleware');
} finally {
  Module._load = originalLoad;
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  const rawUserId = req.get('x-test-user-id');
  const role = req.get('x-test-role') || undefined;

  if (rawUserId !== undefined) {
    const userId = Number(rawUserId);

    if (Number.isFinite(userId) && userId > 0) {
      req.session = {
        userId,
        role,
        user: {
          userId,
          role,
        },
      };
    }
  }

  next();
});
app.use('/inventory', inventoryRoutes);
app.use((err, req, res, next) => {
  errorHandler(err, req, res, next);
});

let server;
let baseUrl;

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, options);
}

test.before(async () => {
  resetData();

  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.beforeEach(() => {
  resetData();
});

test.after(async () => {
  if (!server) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
});

test('inventory endpoints require authentication', async () => {
  const response = await request('/inventory/items');

  assert.equal(response.status, 401);

  const body = await response.json();
  assert.equal(body.error, 'Not authenticated');
});

test('teacher can list and filter inventory items', async () => {
  const response = await request('/inventory/items?onlyAvailable=true', {
    headers: {
      'x-test-user-id': '210',
      'x-test-role': 'teacher',
    },
  });

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.ok(Array.isArray(body.items));
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].itemId, 1);
  assert.equal(body.items[0].status, 'available');
  assert.equal(body.items[0].availableQuantity, 1);
});

test('teacher can read inventory item detail', async () => {
  const response = await request('/inventory/items/2', {
    headers: {
      'x-test-user-id': '211',
      'x-test-role': 'teacher',
    },
  });

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.item.itemId, 2);
  assert.equal(body.item.status, 'reserved');
  assert.equal(body.item.availableQuantity, 0);
});

test('teacher can create a symbolic checkout rental', async () => {
  const response = await request('/inventory/rentals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user-id': '212',
      'x-test-role': 'teacher',
    },
    body: JSON.stringify({
      inventoryItemId: 1,
      startDate: '2026-04-21T10:00:00.000Z',
      endDate: '2026-04-24T10:00:00.000Z',
      paymentMethodId: 1,
    }),
  });

  assert.equal(response.status, 201);

  const body = await response.json();
  assert.equal(body.rental.itemId, 1);
  assert.equal(body.rental.renterId, 212);
  assert.equal(body.rental.symbolicFee, 5);
  assert.equal(body.rental.status, 'pending_validation');

  const activeForItemOne = inventoryTransactions.filter(
    (transaction) => transaction.InventoryItemID === 1 && transaction.IsCompleted === false
  );
  assert.equal(activeForItemOne.length, 2);
});

test('symbolic checkout serializes concurrent reservations for the same item', async () => {
  const originalCount = fakePrisma.inventoryTransaction.count;

  fakePrisma.inventoryTransaction.count = async (args = {}) => {
    await new Promise((resolve) => setImmediate(resolve));
    return originalCount(args);
  };

  try {
    const [firstResponse, secondResponse] = await Promise.all([
      request('/inventory/rentals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': '215',
          'x-test-role': 'teacher',
        },
        body: JSON.stringify({
          inventoryItemId: 1,
          startDate: '2026-04-21T10:00:00.000Z',
          paymentMethodId: 1,
        }),
      }),
      request('/inventory/rentals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-user-id': '216',
          'x-test-role': 'teacher',
        },
        body: JSON.stringify({
          inventoryItemId: 1,
          startDate: '2026-04-21T10:00:00.000Z',
          paymentMethodId: 1,
        }),
      }),
    ]);

    assert.deepEqual(
      [firstResponse.status, secondResponse.status].sort((a, b) => a - b),
      [201, 409],
    );

    const activeForItemOne = inventoryTransactions.filter(
      (transaction) => transaction.InventoryItemID === 1 && transaction.IsCompleted === false
    );
    assert.equal(activeForItemOne.length, 2);
  } finally {
    fakePrisma.inventoryTransaction.count = originalCount;
  }
});

test('symbolic checkout rejects unavailable inventory', async () => {
  const response = await request('/inventory/rentals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user-id': '213',
      'x-test-role': 'teacher',
    },
    body: JSON.stringify({
      inventoryItemId: 2,
      startDate: '2026-04-21T10:00:00.000Z',
      paymentMethodId: 1,
    }),
  });

  assert.equal(response.status, 409);
});

test('symbolic checkout rejects inactive payment methods', async () => {
  const response = await request('/inventory/rentals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-test-user-id': '214',
      'x-test-role': 'teacher',
    },
    body: JSON.stringify({
      inventoryItemId: 1,
      startDate: '2026-04-21T10:00:00.000Z',
      paymentMethodId: 2,
    }),
  });

  assert.equal(response.status, 400);
});

test('inventory endpoints forbid roles outside student and teacher', async () => {
  const response = await request('/inventory/items', {
    headers: {
      'x-test-user-id': '300',
      'x-test-role': 'admin',
    },
  });

  assert.equal(response.status, 403);

  const body = await response.json();
  assert.equal(body.error, 'Forbidden');
});
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
  });
}
