const prisma = require('../config/prisma');
const timetableService = require('../services/timetable.service');
const ocrService = require('../services/timetableOcr.service');

async function listTimetables(req, res, next) {
  try {
    const items = await prisma.Timetable.findMany({ include: { Slots: true } });
    res.json(items);
  } catch (err) { next(err) }
}

async function getTimetable(req, res, next) {
  try {
    const id = Number(req.params.id);
    const item = await prisma.Timetable.findUnique({ where: { TimetableID: id }, include: { Slots: true } });
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
    const created = await prisma.TimetableSlot.create({ data: { TimetableID: timetableId, DayOfWeek: data.dayOfWeek, StartMinutes: data.startMinutes, EndMinutes: data.endMinutes, Title: data.title || '', TeacherUserID: data.teacherUserId || null, StudioID: data.studioId || null, Color: data.color || null, Notes: data.notes || null } });
    res.status(201).json(created);
  } catch (err) { next(err) }
}

async function updateSlot(req, res, next) {
  try {
    const slotId = Number(req.params.slotId);
    const data = req.body;
    const updated = await prisma.TimetableSlot.update({ where: { SlotID: slotId }, data: { DayOfWeek: data.dayOfWeek, StartMinutes: data.startMinutes, EndMinutes: data.endMinutes, Title: data.title, TeacherUserID: data.teacherUserId || null, StudioID: data.studioId || null, Color: data.color || null, Notes: data.notes || null } });
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

// OCR import preview
async function importOcrPreview(req, res, next) {
  try {
    // Expect files in multipart/form-data under 'files'
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'No files uploaded' });
    const previews = [];
    for (const f of files) {
      const buf = f.buffer || (f.path ? require('fs').readFileSync(f.path) : null);
      if (!buf) continue;
      const text = await ocrService.ocrBuffer(buf);
      const parsed = timetableService.parseOcrTextToSlots(text);
      previews.push({ filename: f.originalname || f.name, text, parsed });
    }
    res.json({ previews });
  } catch (err) { next(err) }
}

async function importConfirm(req, res, next) {
  try {
    const { label, slots } = req.body; // slots: array of parsed slot objects
    if (!Array.isArray(slots) || slots.length === 0) return res.status(400).json({ message: 'No slots provided' });
    const created = await prisma.Timetable.create({ data: { Label: label || 'Imported timetable', IsActive: false, CreatedBy: req.user?.userId, Slots: { create: slots.map((s) => ({ DayOfWeek: s.dayOfWeek, StartMinutes: s.startMinutes, EndMinutes: s.endMinutes, Title: s.title || '', TeacherUserID: s.teacherUserId || null, StudioID: s.studioId || null, Color: s.color || null, Notes: s.notes || null })) } }, include: { Slots: true } });
    res.status(201).json(created);
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
  importOcrPreview,
  importConfirm,
};
