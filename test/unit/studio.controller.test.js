const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const mockState = {
  listedStudios: [],
  foundStudio: null,
  modalitiesByName: {},
  lastStudioCreateData: null,
  lastStudioModalityDeleteWhere: null,
  lastStudioModalityCreateManyData: null,
};

const fakePrisma = {
  studio: {
    findMany: async () => mockState.listedStudios,
    findUnique: async ({ where }) => {
      if (mockState.foundStudio && where?.StudioID === mockState.foundStudio.StudioID) {
        return mockState.foundStudio;
      }
      return null;
    },
    create: async ({ data }) => {
      mockState.lastStudioCreateData = data;
      return {
        StudioID: 50,
        StudioName: data.StudioName,
        Capacity: data.Capacity,
        StudioModality: (data.StudioModality?.create || []).map((item) => ({
          ModalityID: item.ModalityID,
          Modality: {
            ModalityName: `Modality ${item.ModalityID}`,
          },
        })),
      };
    },
    update: async ({ data, where }) => ({
      StudioID: where.StudioID,
      StudioName: data.StudioName || mockState.foundStudio?.StudioName || 'Studio',
      Capacity: data.Capacity || mockState.foundStudio?.Capacity || 0,
      StudioModality: [],
    }),
    delete: async () => ({}),
  },
  studioModality: {
    deleteMany: async ({ where }) => {
      mockState.lastStudioModalityDeleteWhere = where;
    },
    createMany: async ({ data }) => {
      mockState.lastStudioModalityCreateManyData = data;
    },
  },
  modality: {
    findMany: async ({ where }) => {
      const ids = where?.ModalityID?.in;
      if (ids) {
        return ids.map((id) => ({ ModalityID: id }));
      }
      const names = where?.ModalityName?.in || [];
      return names
        .map((name) => mockState.modalitiesByName[name])
        .filter(Boolean);
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

let studioController;

try {
  studioController = require('../../src/controllers/studio.controller');
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
  mockState.listedStudios = [];
  mockState.foundStudio = null;
  mockState.modalitiesByName = {};
  mockState.lastStudioCreateData = null;
  mockState.lastStudioModalityDeleteWhere = null;
  mockState.lastStudioModalityCreateManyData = null;
}

test('getStudios returns mapped studio list', async () => {
  resetMockState();

  mockState.listedStudios = [
    {
      StudioID: 1,
      StudioName: 'Sala 1',
      Capacity: 20,
      StudioModality: [
        {
          ModalityID: 2,
          Modality: { ModalityName: 'Ballet' },
        },
      ],
    },
  ];

  const res = createResponse();

  await studioController.getStudios({}, res, (error) => {
    throw error;
  });

  assert.deepEqual(res.payload, [
    {
      studioId: 1,
      studioName: 'Sala 1',
      capacity: 20,
      modalities: [
        {
          modalityId: 2,
          modalityName: 'Ballet',
        },
      ],
    },
  ]);
});

test('createStudio returns 401 when not authenticated', async () => {
  resetMockState();

  const req = {
    session: {},
    body: {
      studioName: 'Sala A',
      capacity: 10,
    },
  };
  const res = createResponse();

  await studioController.createStudio(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: 'Not authenticated' });
});

test('createStudio returns 400 when required fields are missing', async () => {
  resetMockState();

  const req = {
    session: { userId: 1, role: 'admin' },
    body: { studioName: 'Sala A' },
  };
  const res = createResponse();

  await studioController.createStudio(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: 'Studio name and capacity are required' });
});

test('createStudio creates studio with provided modality IDs', async () => {
  resetMockState();

  const req = {
    session: { userId: 1, role: 'admin' },
    body: {
      studioName: 'Sala B',
      capacity: 12,
      modalities: [{ modalityId: 3 }, { modalityId: 4 }],
    },
  };
  const res = createResponse();

  await studioController.createStudio(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 201);
  assert.deepEqual(mockState.lastStudioCreateData.StudioModality.create, [
    { ModalityID: 3 },
    { ModalityID: 4 },
  ]);
  assert.equal(res.payload.studioName, 'Sala B');
  assert.equal(res.payload.capacity, 12);
});

test('updateStudio returns 404 when studio does not exist', async () => {
  resetMockState();

  const req = {
    session: { userId: 1, role: 'admin' },
    params: { id: '999' },
    body: { studioName: 'Updated Name' },
  };
  const res = createResponse();

  await studioController.updateStudio(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { error: 'Studio not found' });
});

test('deleteStudio returns 404 when studio does not exist', async () => {
  resetMockState();

  const req = {
    session: { userId: 1, role: 'admin' },
    params: { id: '999' },
  };
  const res = createResponse();

  await studioController.deleteStudio(req, res, (error) => {
    throw error;
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.payload, { error: 'Studio not found' });
});
