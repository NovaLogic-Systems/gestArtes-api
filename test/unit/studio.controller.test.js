const { PrismaClient } = require('@prisma/client');
const studioController = require('../../controllers/studio.controller');

const prisma = new PrismaClient();

describe('Studio Controller', () => {
  beforeEach(async () => {
    await prisma.studioModality.deleteMany();
    await prisma.studio.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('createStudio', () => {
    test('should create studio with modalities', async () => {
      const req = {
        session: { userId: 1, role: 'admin' },
        body: {
          studioName: 'Estúdio Teste',
          capacity: 15,
          modalities: [{ modalityId: 1 }, { modalityId: 2 }],
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await studioController.createStudio(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });

    test('should return 400 if name or capacity missing', async () => {
      const req = {
        session: { userId: 1, role: 'admin' },
        body: { studioName: 'Test' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await studioController.createStudio(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: expect.any(String) });
    });
  });

  describe('getStudios', () => {
    test('should return list of studios', async () => {
      const req = {};
      const res = {
        json: jest.fn(),
      };
      const next = jest.fn();

      await studioController.getStudios(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  describe('updateStudio', () => {
    test('should return 404 if studio not found', async () => {
      const req = {
        session: { userId: 1, role: 'admin' },
        params: { id: '999' },
        body: { studioName: 'Updated Name' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await studioController.updateStudio(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Studio not found' });
    });
  });

  describe('deleteStudio', () => {
    test('should return 404 if studio not found', async () => {
      const req = {
        session: { userId: 1, role: 'admin' },
        params: { id: '999' },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await studioController.deleteStudio(req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
