const prisma = require('../config/prisma');
const {
  getStudioOccupancyRealTime,
  getStudioOccupancyForecast: getStudioOccupancyForecastService,
  blockStudio: createStudioBlock,
  updateStudioStatus,
} = require('../services/studioOccupancy.service');

function toInteger(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAuthenticatedAdminUserId(req, res) {
  const userId = Number(req.auth?.userId);
  const role = String(req.auth?.role || '').trim().toLowerCase();
  
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  
  if (role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  
  return userId;
}

async function resolveModalityIds(modalities) {
  if (!Array.isArray(modalities) || modalities.length === 0) {
    return [];
  }

  const hasModalityId = modalities[0]?.modalityId !== undefined;
  const hasModalityName = modalities[0]?.modalityName !== undefined;

  if (hasModalityId) {
    const modalityIds = Array.from(
      new Set(
        modalities
          .map((entry) => Number(entry?.modalityId))
          .filter((entry) => Number.isInteger(entry) && entry > 0)
      )
    );

    if (modalityIds.length !== modalities.length) {
      const error = new Error('Invalid modality IDs');
      error.status = 400;
      throw error;
    }

    const found = await prisma.modality.findMany({
      where: {
        ModalityID: {
          in: modalityIds,
        },
      },
      select: {
        ModalityID: true,
      },
    });

    if (found.length !== modalityIds.length) {
      const error = new Error('One or more modalities do not exist');
      error.status = 400;
      throw error;
    }

    return found.map((entry) => entry.ModalityID);
  }

  const modalityNames = hasModalityName
    ? modalities.map((entry) => String(entry?.modalityName || '').trim())
    : modalities.map((entry) => String(entry || '').trim());

  if (modalityNames.some((entry) => !entry)) {
    const error = new Error('Invalid modality names');
    error.status = 400;
    throw error;
  }

  const dedupedNames = Array.from(new Set(modalityNames));

  const foundModalities = await prisma.modality.findMany({
    where: {
      ModalityName: {
        in: dedupedNames,
      },
    },
    select: {
      ModalityID: true,
      ModalityName: true,
    },
  });

  if (foundModalities.length !== dedupedNames.length) {
    const error = new Error('One or more modalities do not exist');
    error.status = 400;
    throw error;
  }

  return foundModalities.map((entry) => entry.ModalityID);
}

async function getStudios(req, res, next) {
  try {
    const studios = await prisma.studio.findMany({
      include: {
        StudioModality: {
          include: {
            Modality: true,
          },
        },
      },
      orderBy: {
        StudioName: 'asc',
      },
    });

    const result = studios.map((studio) => ({
      studioId: toInteger(studio.StudioID),
      studioName: studio.StudioName,
      capacity: toInteger(studio.Capacity),
      modalities: studio.StudioModality.map((sm) => ({
        modalityId: toInteger(sm.ModalityID),
        modalityName: sm.Modality.ModalityName,
      })),
    }));

    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function getStudioById(req, res, next) {
  try {
    const studioId = toInteger(req.params.id);
    
    if (!studioId) {
      res.status(400).json({ error: 'Invalid studio ID' });
      return;
    }

    const studio = await prisma.studio.findUnique({
      where: { StudioID: studioId },
      include: {
        StudioModality: {
          include: {
            Modality: true,
          },
        },
      },
    });

    if (!studio) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }

    const result = {
      studioId: toInteger(studio.StudioID),
      studioName: studio.StudioName,
      capacity: toInteger(studio.Capacity),
      modalities: studio.StudioModality.map((sm) => ({
        modalityId: toInteger(sm.ModalityID),
        modalityName: sm.Modality.ModalityName,
      })),
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function createStudio(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);
    if (!adminUserId) {
      return;
    }

    const { studioName, capacity, modalities = [] } = req.body;

    if (!studioName || !capacity) {
      res.status(400).json({ error: 'Studio name and capacity are required' });
      return;
    }

    const modalityIds = await resolveModalityIds(modalities);

    const studio = await prisma.studio.create({
      data: {
        StudioName: studioName,
        Capacity: toInteger(capacity),
        StudioModality: modalityIds.length > 0
          ? {
              create: modalityIds.map((modalityId) => ({
                ModalityID: modalityId,
              })),
            }
          : undefined,
      },
      include: {
        StudioModality: {
          include: {
            Modality: true,
          },
        },
      },
    });

    const result = {
      studioId: toInteger(studio.StudioID),
      studioName: studio.StudioName,
      capacity: toInteger(studio.Capacity),
      modalities: studio.StudioModality.map((sm) => ({
        modalityId: toInteger(sm.ModalityID),
        modalityName: sm.Modality.ModalityName,
      })),
    };

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function updateStudio(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);
    if (!adminUserId) {
      return;
    }

    const studioId = toInteger(req.params.id);
    if (!studioId) {
      res.status(400).json({ error: 'Invalid studio ID' });
      return;
    }

    const { studioName, capacity, modalities = [] } = req.body;

    const existingStudio = await prisma.studio.findUnique({
      where: { StudioID: studioId },
    });

    if (!existingStudio) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }

    const updateData = {};

    if (studioName !== undefined) {
      updateData.StudioName = studioName;
    }

    if (capacity !== undefined) {
      updateData.Capacity = toInteger(capacity);
    }

    if (modalities !== undefined) {
      await prisma.studioModality.deleteMany({
        where: { StudioID: studioId },
      });

      if (modalities.length > 0) {
        const modalityIds = await resolveModalityIds(modalities);

        if (modalityIds.length > 0) {
          await prisma.studioModality.createMany({
            data: modalityIds.map((modalityId) => ({
              StudioID: studioId,
              ModalityID: modalityId,
            })),
          });
        }
      }
    }

    const updatedStudio = await prisma.studio.update({
      where: { StudioID: studioId },
      data: updateData,
      include: {
        StudioModality: {
          include: {
            Modality: true,
          },
        },
      },
    });

    const result = {
      studioId: toInteger(updatedStudio.StudioID),
      studioName: updatedStudio.StudioName,
      capacity: toInteger(updatedStudio.Capacity),
      modalities: updatedStudio.StudioModality.map((sm) => ({
        modalityId: toInteger(sm.ModalityID),
        modalityName: sm.Modality.ModalityName,
      })),
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function deleteStudio(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);
    if (!adminUserId) {
      return;
    }

    const studioId = toInteger(req.params.id);
    if (!studioId) {
      res.status(400).json({ error: 'Invalid studio ID' });
      return;
    }

    const existingStudio = await prisma.studio.findUnique({
      where: { StudioID: studioId },
    });

    if (!existingStudio) {
      res.status(404).json({ error: 'Studio not found' });
      return;
    }

    await prisma.studio.delete({
      where: { StudioID: studioId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

async function getStudioOccupancy(req, res, next) {
  try {
    const payload = await getStudioOccupancyRealTime({
      at: req.query?.at,
    });

    res.json(payload);
  } catch (error) {
    if (error?.status) {
      res.status(error.status).json({
        error: error.message,
        details: error.details || null,
      });
      return;
    }

    next(error);
  }
}

async function getStudioOccupancyForecast(req, res, next) {
  try {
    const payload = await getStudioOccupancyForecastService({
      from: req.query?.from,
      to: req.query?.to,
    });

    res.json(payload);
  } catch (error) {
    if (error?.status) {
      res.status(error.status).json({
        error: error.message,
        details: error.details || null,
      });
      return;
    }

    next(error);
  }
}

async function blockStudio(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);
    if (!adminUserId) {
      return;
    }

    const studioId = toInteger(req.body?.studioId);
    const payload = await createStudioBlock({
      studioId,
      startsAt: req.body?.startsAt,
      endsAt: req.body?.endsAt,
      reason: req.body?.reason,
      blockType: req.body?.blockType,
      userId: adminUserId,
    });

    res.status(201).json(payload);
  } catch (error) {
    if (error?.status) {
      res.status(error.status).json({
        error: error.message,
        details: error.details || null,
      });
      return;
    }

    next(error);
  }
}

async function updateStudioOccupancyStatus(req, res, next) {
  try {
    const adminUserId = getAuthenticatedAdminUserId(req, res);
    if (!adminUserId) {
      return;
    }

    const studioId = toInteger(req.params?.studioId);
    const payload = await updateStudioStatus({
      studioId,
      status: req.body?.status,
      reason: req.body?.reason,
      startsAt: req.body?.startsAt,
      endsAt: req.body?.endsAt,
      userId: adminUserId,
    });

    res.json(payload);
  } catch (error) {
    if (error?.status) {
      res.status(error.status).json({
        error: error.message,
        details: error.details || null,
      });
      return;
    }

    next(error);
  }
}

module.exports = {
  getStudios,
  getStudioById,
  createStudio,
  updateStudio,
  deleteStudio,
  getStudioOccupancy,
  getStudioOccupancyForecast,
  blockStudio,
  updateStudioOccupancyStatus,
};
