const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const studioController = require('../controllers/studio.controller');
const prisma = require('../config/prisma');

const router = express.Router();

router.post('/', requireAuth, requireRole('admin'), studioController.createStudio);
router.get('/', requireAuth, requireRole('admin'), studioController.getStudios);
router.get('/options', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const modalities = await prisma.modality.findMany({
      select: {
        ModalityID: true,
        ModalityName: true,
      },
      orderBy: {
        ModalityName: 'asc',
      },
    });

    res.json({
      modalities: modalities.map((m) => ({
        modalityId: m.ModalityID,
        modalityName: m.ModalityName,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/options', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const type = String(req.body?.type || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();

    if (!name) {
      res.status(400).json({ error: 'Option name is required' });
      return;
    }

    if (type !== 'modalities') {
      // Formats are not stored in DB yet; keep compatibility with frontend flow.
      res.status(201).json({ name });
      return;
    }

    const existing = await prisma.modality.findFirst({
      where: {
        ModalityName: name,
      },
      select: {
        ModalityID: true,
        ModalityName: true,
      },
    });

    if (existing) {
      res.status(200).json({
        modalityId: existing.ModalityID,
        modalityName: existing.ModalityName,
        name: existing.ModalityName,
      });
      return;
    }

    const created = await prisma.modality.create({
      data: {
        ModalityName: name,
      },
      select: {
        ModalityID: true,
        ModalityName: true,
      },
    });

    res.status(201).json({
      modalityId: created.ModalityID,
      modalityName: created.ModalityName,
      name: created.ModalityName,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireAuth, requireRole('admin'), studioController.getStudioById);
router.patch('/:id', requireAuth, requireRole('admin'), studioController.updateStudio);
router.delete('/:id', requireAuth, requireRole('admin'), studioController.deleteStudio);

module.exports = router;
