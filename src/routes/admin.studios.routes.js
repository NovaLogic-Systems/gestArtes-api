/**
 * @file src/routes/admin.studios.routes.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const express = require('express');
const { requireAuth, requireAdminRole } = require('../middlewares/auth.middleware');
const studioController = require('../controllers/studio.controller');
const prisma = require('../config/prisma');

const router = express.Router();
const adminAccess = [requireAuth, requireAdminRole];

router.post('/', ...adminAccess, studioController.createStudio);
router.get('/', ...adminAccess, studioController.getStudios);
router.get('/options', ...adminAccess, async (req, res, next) => {
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

router.post('/options', ...adminAccess, async (req, res, next) => {
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

router.delete('/options/:id', ...adminAccess, async (req, res, next) => {
  try {
    const type = String(req.query?.type || '').trim().toLowerCase();
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    if (type !== 'modalities') {
      res.status(400).json({ error: 'Tipo de opção inválido. Apenas "modalities" é suportado.' });
      return;
    }

    const existing = await prisma.modality.findUnique({
      where: { ModalityID: id },
      select: {
        ModalityID: true,
        _count: {
          select: {
            CoachingSession: true,
            CoachingRequest: true,
            GroupCoachingProposal: true,
          },
        },
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Modalidade não encontrada' });
      return;
    }

    const blockedByHistory =
      existing._count.CoachingSession +
      existing._count.CoachingRequest +
      existing._count.GroupCoachingProposal;

    if (blockedByHistory > 0) {
      res.status(409).json({
        error: `Não é possível apagar esta modalidade. Está associada a ${blockedByHistory} sessão(ões) ou pedido(s) de coaching existentes, que são registos históricos e não podem ser desvinculados.`,
      });
      return;
    }

    await prisma.$transaction([
      prisma.studioModality.deleteMany({ where: { ModalityID: id } }),
      prisma.teacherModality.deleteMany({ where: { ModalityID: id } }),
      prisma.studentAllowedModality.deleteMany({ where: { ModalityID: id } }),
      prisma.timetableSlot.updateMany({
        where: { ModalityID: id },
        data: { ModalityID: null },
      }),
      prisma.modality.delete({ where: { ModalityID: id } }),
    ]);

    res.status(200).json({ success: true, modalityId: id });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', ...adminAccess, studioController.getStudioById);
router.patch('/:id', ...adminAccess, studioController.updateStudio);
router.delete('/:id', ...adminAccess, studioController.deleteStudio);

module.exports = router;

