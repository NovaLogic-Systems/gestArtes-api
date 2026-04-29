async function resolveOrCreateSessionStatus(tx, statusName) {
  const existing = await tx.sessionStatus.findFirst({
    where: { StatusName: { contains: statusName } },
  });

  if (existing) {
    return existing.StatusID;
  }

  const created = await tx.sessionStatus.create({
    data: { StatusName: statusName },
  });

  return created.StatusID;
}

module.exports = {
  resolveOrCreateSessionStatus,
};