/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

/**
 * ═════════════════════════════════════════════════════════════════════════
 * TESTES: marketplace.controller.js (Classificados Internos da Escola)
 * ═════════════════════════════════════════════════════════════════════════
 * 
 * O QUE ESTÁ A SER TESTADO:
 * ─────────────────────────
 *   Endpoints para anúncios de compra/venda entre utilizadores:
 *   - listMarketplaceListings(): Lista anúncios com filtros
 *   - getMarketplaceListingById(): Detalhe do anúncio
 *   - createMarketplaceListing(): Criar anúncio
 *   - updateMarketplaceListing(): Editar anúncio (dono ou admin)
 *   - close/delete listing: Encerrar anúncio
 * 
 * REGRAS DE NEGÓCIO:
 * ──────────────────
 *   - Apenas utilizadores autenticados podem criar anúncios
 *   - Só dono do anúncio (ou admin) pode editar/remover
 *   - Itens marcados como vendidos não aceitam novas transações
 *   - Filtros por categoria, preço, modalidade, estado
 * 
 * OBJETIVO DOS TESTES:
 * ───────────────────
 *   Garantir que respostas estão corretamente serializadas para frontend
 *   e que queries de listagem aplicam filtros/paginação esperados.
 */

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
    auth: {
      userId: 99,
    },
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
  assert.equal(mockState.lastFindManyArgs.where.SellerID.not, 99);
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
    auth: {
      userId: 15,
    },
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
  assert.equal(mockState.lastFindManyArgs.where.SellerID.not, 15);
  assert.deepEqual(res.payload, { listings: [] });
});
