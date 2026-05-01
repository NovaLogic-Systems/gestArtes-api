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
  statusRows: [],
  listingById: null,
  lastFindManyArgs: null,
  lastUpdateArgs: null,
};

const fakePrisma = {
  marketplaceItemStatus: {
    findMany: async () => mockState.statusRows,
  },
  marketplaceItem: {
    findMany: async (args) => {
      mockState.lastFindManyArgs = args;
      return mockState.listings;
    },
    findUnique: async () => mockState.listingById,
    update: async (args) => {
      mockState.lastUpdateArgs = args;
      return {
        MarketplaceItemID: args.where.MarketplaceItemID,
        SellerID: 42,
        Title: 'Sample listing',
        Description: 'Sample description',
        RejectionReason: args.data.RejectionReason ?? null,
        Price: 23.5,
        PhotoURL: null,
        Location: 'Viana do Castelo',
        CreatedAt: new Date('2026-04-24T10:00:00Z'),
        IsActive: Boolean(args.data.IsActive),
        ItemCategory: null,
        MarketplaceItemCondition: null,
        MarketplaceItemStatus: {
          StatusID: args.data.StatusID ?? 0,
          StatusName: 'Status',
        },
        User: {
          UserID: 42,
          FirstName: 'Ana',
          LastName: 'Silva',
          Email: 'ana@example.com',
          PhoneNumber: '999999999',
        },
      };
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

let adminMarketplaceController;

try {
  adminMarketplaceController = require('../../src/controllers/admin_marketplace.controller');
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
  mockState.statusRows = [];
  mockState.listingById = null;
  mockState.lastFindManyArgs = null;
  mockState.lastUpdateArgs = null;
}

test('getListings returns serialized marketplace listings for admin moderation', async () => {
  resetMockState();

  mockState.listings = [
    {
      MarketplaceItemID: 101,
      SellerID: 10,
      Title: 'Sapatos Jazz',
      Description: 'Muito bons',
      RejectionReason: null,
      Price: 20,
      PhotoURL: 'https://img.example/sapatos.jpg',
      Location: 'Viana do Castelo',
      CreatedAt: new Date('2026-04-21T10:00:00Z'),
      IsActive: false,
      ItemCategory: { CategoryID: 1, CategoryName: 'Calçado' },
      MarketplaceItemCondition: { ConditionID: 2, ConditionName: 'Bom' },
      MarketplaceItemStatus: { StatusID: 3, StatusName: 'Pending' },
      User: {
        UserID: 10,
        FirstName: 'Rita',
        LastName: 'Moreira',
        Email: 'rita@example.com',
        PhoneNumber: '912000000',
      },
    },
  ];

  const req = {
    query: {
      status: 'pending',
      location: 'Viana',
      minPrice: 5,
      maxPrice: 40,
    },
  };
  const res = createResponse();

  await adminMarketplaceController.getListings(req, res, (error) => {
    throw error;
  });

  assert.equal(Array.isArray(res.payload.listings), true);
  assert.equal(res.payload.listings.length, 1);
  assert.equal(res.payload.listings[0].listingId, 101);
  assert.equal(res.payload.listings[0].status.statusName, 'Pending');
  assert.ok(mockState.lastFindManyArgs.where);
});

test('approveListing sets listing as active and clears rejection reason', async () => {
  resetMockState();

  mockState.listingById = { MarketplaceItemID: 101 };
  mockState.statusRows = [
    { StatusID: 1, StatusName: 'Pending' },
    { StatusID: 2, StatusName: 'Approved' },
    { StatusID: 3, StatusName: 'Rejected' },
  ];

  const req = { params: { id: 101 } };
  const res = createResponse();

  await adminMarketplaceController.approveListing(req, res, (error) => {
    throw error;
  });

  assert.equal(mockState.lastUpdateArgs.data.IsActive, true);
  assert.equal(mockState.lastUpdateArgs.data.RejectionReason, null);
  assert.equal(mockState.lastUpdateArgs.data.StatusID, 2);
  assert.equal(res.payload.listing.listingId, 101);
});

test('rejectListing stores rejection reason and deactivates listing', async () => {
  resetMockState();

  mockState.listingById = { MarketplaceItemID: 102 };
  mockState.statusRows = [
    { StatusID: 1, StatusName: 'Pending' },
    { StatusID: 2, StatusName: 'Approved' },
    { StatusID: 3, StatusName: 'Rejected' },
  ];

  const req = {
    params: { id: 102 },
    body: { reason: 'Conteúdo não permitido' },
  };
  const res = createResponse();

  await adminMarketplaceController.rejectListing(req, res, (error) => {
    throw error;
  });

  assert.equal(mockState.lastUpdateArgs.data.IsActive, false);
  assert.equal(mockState.lastUpdateArgs.data.RejectionReason, 'Conteúdo não permitido');
  assert.equal(mockState.lastUpdateArgs.data.StatusID, 3);
  assert.equal(res.payload.listing.listingId, 102);
});

test('deleteListing returns 204 and deactivates listing', async () => {
  resetMockState();

  mockState.listingById = {
    MarketplaceItemID: 103,
    RejectionReason: 'texto antigo',
  };
  mockState.statusRows = [
    { StatusID: 1, StatusName: 'Pending' },
    { StatusID: 4, StatusName: 'Removed' },
  ];

  const req = { params: { id: 103 } };
  const res = createResponse();

  await adminMarketplaceController.deleteListing(req, res, (error) => {
    throw error;
  });

  assert.equal(mockState.lastUpdateArgs.data.IsActive, false);
  assert.equal(mockState.lastUpdateArgs.data.StatusID, 4);
  assert.equal(res.statusCode, 204);
});

test('approveListing yields 404 when listing does not exist', async () => {
  resetMockState();

  mockState.listingById = null;

  const req = { params: { id: 999 } };
  const res = createResponse();
  let forwardedError = null;

  await adminMarketplaceController.approveListing(req, res, (error) => {
    forwardedError = error;
  });

  assert.ok(forwardedError);
  assert.equal(forwardedError.status, 404);
});
