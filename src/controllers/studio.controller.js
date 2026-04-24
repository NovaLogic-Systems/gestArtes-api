const prisma = require('../config/prisma');

function toInteger(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAuthenticatedAdminUserId(req, res) {
  const userId = Number(req.session?.userId);
  const role = String(req.session?.role || '').trim().toLowerCase();
  
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

    // Process modalities - can be IDs (numbers) or names (strings)
    let modalityIds = [];
    if (modalities.length > 0) {
      // Check if modalities are objects with modalityId or modalityName
      const hasModalityId = modalities[0]?.modalityId !== undefined;
      const hasModalityName = modalities[0]?.modalityName !== undefined;

      if (hasModalityId) {
        // Format: [{ modalityId: 1 }, { modalityId: 2 }]
        modalityIds = modalities.map(m => m.modalityId);
      } else if (hasModalityName) {
        // Format: [{ modalityName: 'Ballet' }, { modalityName: 'Jazz' }]
        const modalityNames = modalities.map(m => m.modalityName);
        const foundModalities = await prisma.modality.findMany({
          where: {
            ModalityName: {
              in: modalityNames,
            },
          },
        });
        modalityIds = foundModalities.map(m => m.ModalityID);
      } else {
        // Format: ['Ballet', 'Jazz'] - names as strings
        const modalityNames = modalities.filter(m => typeof m === 'string');
        if (modalityNames.length > 0) {
          const foundModalities = await prisma.modality.findMany({
            where: {
              ModalityName: {
                in: modalityNames,
              },
            },
          });
          modalityIds = foundModalities.map(m => m.ModalityID);
        }
      }
    }

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
        let modalityIds = [];

        // Check format of modalities
        const hasModalityId = modalities[0]?.modalityId !== undefined;
        const hasModalityName = modalities[0]?.modalityName !== undefined;

        if (hasModalityId) {
          // Format: [{ modalityId: 1 }, { modalityId: 2 }]
          modalityIds = modalities.map(m => m.modalityId);
        } else if (hasModalityName) {
          // Format: [{ modalityName: 'Ballet' }, { modalityName: 'Jazz' }]
          const modalityNames = modalities.map(m => m.modalityName);
          const foundModalities = await prisma.modality.findMany({
            where: {
              ModalityName: {
                in: modalityNames,
              },
            },
          });
          modalityIds = foundModalities.map(m => m.ModalityID);
        } else {
          // Format: ['Ballet', 'Jazz'] - names as strings
          const modalityNames = modalities.filter(m => typeof m === 'string');
          if (modalityNames.length > 0) {
            const foundModalities = await prisma.modality.findMany({
              where: {
                ModalityName: {
                  in: modalityNames,
                },
              },
            });
            modalityIds = foundModalities.map(m => m.ModalityID);
          }
        }

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

module.exports = {
  getStudios,
  getStudioById,
  createStudio,
  updateStudio,
  deleteStudio,
};
