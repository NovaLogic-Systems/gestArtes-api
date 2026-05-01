/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mockState = {
  listings: [],
  lastFindManyArgs: null,
};

const fakePrisma = {
  marketplaceItem: {
    findMany: async (args) => {
      mockState.lastFindManyArgs = args;
      return mockState.listings;
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

let marketplaceController;

try {
  marketplaceController = require('../../src/controllers/marketplace.controller');
} finally {
  Module._load = originalLoad;
}

function createResponse() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
    send() {
      return this;
    },
  };
}

function resetMockState() {
  mockState.listings = [];
  mockState.lastFindManyArgs = null;
}

test('getListings applies q/category/location/price filters and returns serialized listings', async () => {
  resetMockState();

  mockState.listings = [
    {
      MarketplaceItemID: 12,
      SellerID: 8,
      Title: 'Sapatilhas de danca',
      Description: 'Bom estado',
      RejectionReason: null,
      Price: 55,
      PhotoURL: null,
      Location: 'Braga',
      CreatedAt: new Date('2026-04-22T10:00:00Z'),
      IsActive: true,
      ItemCategory: { CategoryID: 3, CategoryName: 'Calcado' },
      MarketplaceItemCondition: { ConditionID: 2, ConditionName: 'Bom' },
      MarketplaceItemStatus: { StatusID: 4, StatusName: 'Approved' },
      User: { UserID: 8, FirstName: 'Ines', LastName: 'Silva' },
    },
  ];

  const req = {
    query: {
      q: 'sapatilhas',
      category: '3',
      minPrice: 10,
      maxPrice: 100,
      location: 'Braga',
    },
  };
  const res = createResponse();

  await marketplaceController.getListings(req, res, (error) => {
    throw error;
  });

  assert.ok(mockState.lastFindManyArgs);
  assert.equal(mockState.lastFindManyArgs.where.IsActive, true);
  assert.equal(mockState.lastFindManyArgs.where.CategoryID, 3);
  assert.equal(mockState.lastFindManyArgs.where.Price.gte, 10);
  assert.equal(mockState.lastFindManyArgs.where.Price.lte, 100);
  assert.equal(mockState.lastFindManyArgs.where.Location.contains, 'Braga');
  assert.equal(Array.isArray(mockState.lastFindManyArgs.where.OR), true);
  assert.deepEqual(mockState.lastFindManyArgs.where.OR, [
    { Title: { contains: 'sapatilhas' } },
    { Description: { contains: 'sapatilhas' } },
  ]);

  assert.equal(res.payload.listings.length, 1);
  assert.equal(res.payload.listings[0].listingId, 12);
  assert.equal(res.payload.listings[0].title, 'Sapatilhas de danca');
});

test('getListings still supports legacy search parameter when q is absent', async () => {
  resetMockState();

  const req = {
    query: {
      search: 'fato',
    },
  };
  const res = createResponse();

  await marketplaceController.getListings(req, res, (error) => {
    throw error;
  });

  assert.deepEqual(mockState.lastFindManyArgs.where.OR, [
    { Title: { contains: 'fato' } },
    { Description: { contains: 'fato' } },
  ]);
  assert.deepEqual(res.payload, { listings: [] });
});
