/**
 * @file src/services/lostFound.service.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');

function isAdminRole(role) {
  return String(role || '').trim().toLowerCase() === 'admin';
}

function toPublicDto(item) {
  return {
    id: item.LostItemID,
    title: item.Title,
    description: item.Description,
    foundDate: item.FoundDate,
    claimedStatus: item.ClaimedStatus,
    photoUrl: item.PhotoURL,
  };
}

function toAdminDto(item, role) {
  const dto = {
    ...toPublicDto(item),
    isArchived: item.IsArchived,
    archivedAt: item.ArchivedAt,
    registeredByUserId: item.RegisteredByUserID,
  };

  if (isAdminRole(role)) {
    dto.adminNotes = item.AdminNotes;
  }

  return dto;
}

async function findItemById(id) {
  return prisma.lostAndFoundItem.findUnique({
    where: { LostItemID: id },
  });
}

async function listPublicItems() {
  const items = await prisma.lostAndFoundItem.findMany({
    where: {
      IsArchived: false,
    },
    orderBy: {
      FoundDate: 'desc',
    },
  });

  return items.map(toPublicDto);
}

async function getPublicItemById(id) {
  const item = await prisma.lostAndFoundItem.findFirst({
    where: {
      LostItemID: id,
      IsArchived: false,
    },
  });

  return item ? toPublicDto(item) : null;
}

async function listAdminItems(role) {
  const items = await prisma.lostAndFoundItem.findMany({
    orderBy: [
      { IsArchived: 'asc' },
      { FoundDate: 'desc' },
    ],
  });

  return items.map((item) => toAdminDto(item, role));
}

async function getAdminItemById(id, role) {
  const item = await findItemById(id);

  return item ? toAdminDto(item, role) : null;
}

async function createItem(data, registeredByUserId, role) {
  const created = await prisma.lostAndFoundItem.create({
    data: {
      Title: data.title,
      Description: data.description,
      FoundDate: data.foundDate,
      ClaimedStatus: data.claimedStatus ?? false,
      PhotoURL: data.photoUrl,
      AdminNotes: data.adminNotes,
      RegisteredByUserID: registeredByUserId,
    },
  });

  return toAdminDto(created, role);
}

async function updateItem(id, data, role) {
  const existing = await findItemById(id);

  if (!existing) {
    return null;
  }

  const updated = await prisma.lostAndFoundItem.update({
    where: { LostItemID: id },
    data: {
      Title: data.title,
      Description: data.description,
      FoundDate: data.foundDate,
      ClaimedStatus: data.claimedStatus,
      PhotoURL: data.photoUrl,
      AdminNotes: data.adminNotes,
    },
  });

  return toAdminDto(updated, role);
}

async function deleteItem(id) {
  const existing = await findItemById(id);

  if (!existing) {
    return false;
  }

  await prisma.lostAndFoundItem.delete({
    where: { LostItemID: id },
  });

  return true;
}

async function claimItem(id, adminNotes, role) {
  const existing = await findItemById(id);

  if (!existing) {
    return null;
  }

  const updated = await prisma.lostAndFoundItem.update({
    where: { LostItemID: id },
    data: {
      ClaimedStatus: true,
      ...(adminNotes !== undefined ? { AdminNotes: adminNotes } : {}),
    },
  });

  return toAdminDto(updated, role);
}

async function markClaimed(id, adminNotes, role) {
  return claimItem(id, adminNotes, role);
}

async function archiveItem(id, adminNotes, role) {
  const existing = await findItemById(id);

  if (!existing) {
    return null;
  }

  const updated = await prisma.lostAndFoundItem.update({
    where: { LostItemID: id },
    data: {
      IsArchived: true,
      ArchivedAt: new Date(),
      ...(adminNotes !== undefined ? { AdminNotes: adminNotes } : {}),
    },
  });

  return toAdminDto(updated, role);
}

async function publishItem(data, role) {
  return createItem(data, role);
}

async function publish(data, role) {
  return createItem(data, role);
}

module.exports = {
  listPublicItems,
  getPublicItemById,
  listAdminItems,
  getAdminItemById,
  createItem,
  publishItem,
  publish,
  updateItem,
  deleteItem,
  claimItem,
  markClaimed,
  archiveItem,
};

