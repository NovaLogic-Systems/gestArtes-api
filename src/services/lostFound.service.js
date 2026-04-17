const prisma = require('../config/prisma');

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

function toAdminDto(item) {
  return {
    ...toPublicDto(item),
    isArchived: item.IsArchived,
    adminNotes: item.AdminNotes,
    archivedAt: item.ArchivedAt,
    registeredByUserId: item.RegisteredByUserID,
  };
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

async function createItem(data, registeredByUserId) {
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

  return toAdminDto(created);
}

async function updateItem(id, data) {
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

  return toAdminDto(updated);
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

async function claimItem(id, adminNotes) {
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

  return toAdminDto(updated);
}

async function archiveItem(id, adminNotes) {
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

  return toAdminDto(updated);
}

module.exports = {
  listPublicItems,
  getPublicItemById,
  createItem,
  updateItem,
  deleteItem,
  claimItem,
  archiveItem,
};
