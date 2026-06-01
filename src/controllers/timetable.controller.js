const prisma = require('../config/prisma');

const SLOT_INCLUDE = {
  Slots: {
    include: {
      Modality: { select: { ModalityID: true, ModalityName: true } },
    },
  },
};

async function listTimetables(req, res, next) {
  try {
    const items = await prisma.Timetable.findMany({ include: SLOT_INCLUDE });
    res.json(items);
  } catch (err) { next(err) }
}

async function getTimetable(req, res, next) {
  try {
    const id = Number(req.params.id);
    const item = await prisma.Timetable.findUnique({ where: { TimetableID: id }, include: SLOT_INCLUDE });
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch (err) { next(err) }
}

async function createTimetable(req, res, next) {
  try {
    const { label, isActive } = req.body;
    const created = await prisma.Timetable.create({ data: { Label: label || 'Untitled', IsActive: !!isActive, CreatedBy: req.user?.userId } });
    res.status(201).json(created);
  } catch (err) { next(err) }
}

async function updateTimetable(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { label, isActive } = req.body;
    const updated = await prisma.Timetable.update({ where: { TimetableID: id }, data: { Label: label, IsActive: isActive } });
    res.json(updated);
  } catch (err) { next(err) }
}

async function deleteTimetable(req, res, next) {
  try {
    const id = Number(req.params.id);
    await prisma.Timetable.delete({ where: { TimetableID: id } });
    res.status(204).end();
  } catch (err) { next(err) }
}

// Slots
async function createSlot(req, res, next) {
  try {
    const timetableId = Number(req.params.id);
    const data = req.body;
    const created = await prisma.TimetableSlot.create({ data: { TimetableID: timetableId, DayOfWeek: data.dayOfWeek, StartMinutes: data.startMinutes, EndMinutes: data.endMinutes, Title: data.title || '', TeacherUserID: data.teacherUserId || null, StudioID: data.studioId || null, ModalityID: data.modalityId ? Number(data.modalityId) : null, Color: data.color || null, Notes: data.notes || null } });
    res.status(201).json(created);
  } catch (err) { next(err) }
}

async function updateSlot(req, res, next) {
  try {
    const slotId = Number(req.params.slotId);
    const data = req.body;
    const updated = await prisma.TimetableSlot.update({ where: { SlotID: slotId }, data: { DayOfWeek: data.dayOfWeek, StartMinutes: data.startMinutes, EndMinutes: data.endMinutes, Title: data.title, TeacherUserID: data.teacherUserId || null, StudioID: data.studioId || null, ModalityID: data.modalityId ? Number(data.modalityId) : null, Color: data.color || null, Notes: data.notes || null } });
    res.json(updated);
  } catch (err) { next(err) }
}

async function deleteSlot(req, res, next) {
  try {
    const slotId = Number(req.params.slotId);
    await prisma.TimetableSlot.delete({ where: { SlotID: slotId } });
    res.status(204).end();
  } catch (err) { next(err) }
}

module.exports = {
  listTimetables,
  getTimetable,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  createSlot,
  updateSlot,
  deleteSlot,
};
