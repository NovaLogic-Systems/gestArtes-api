/**
 * Simple helpers to parse OCR text into timetable slots.
 * This is a best-effort parser: it tries to detect day headers and time ranges.
 */

function parseTimeToMinutes(token) {
  if (!token) return null;
  const m = token.match(/(\d{1,2})[:h](\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function parseOcrTextToSlots(text) {
  // Normalize
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const daysMap = {
    'SEGUNDA': 1, 'SEGUNDA-FEIRA': 1, 'SEG': 1,
    'TERCA': 2, 'TERÇA': 2, 'TERÇA-FEIRA': 2, 'TER': 2,
    'QUARTA': 3, 'QUARTA-FEIRA': 3, 'QUA': 3,
    'QUINTA': 4, 'QUINTA-FEIRA': 4, 'QUI': 4,
    'SEXTA': 5, 'SEXTA-FEIRA': 5, 'SEX': 5,
    'SABADO': 6, 'SÁBADO': 6, 'SÁBADO': 6, 'SAB': 6,
    'DOMINGO': 7, 'DOM': 7,
  };

  const slots = [];
  let currentDay = null;

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i].toUpperCase();
    // detect day header
    for (const k of Object.keys(daysMap)) {
      if (L.startsWith(k)) {
        currentDay = daysMap[k];
        break;
      }
    }

    // detect time range like 09:00 - 10:30 or 09h00 - 10h30
    const timeRange = L.match(/(\d{1,2}[:h]\d{2})\s*[\-–toa]{1,3}\s*(\d{1,2}[:h]\d{2})/i);
    if (timeRange) {
      const start = parseTimeToMinutes(timeRange[1]);
      const end = parseTimeToMinutes(timeRange[2]);
      // title may be on the same line after the time, or on next line
      let title = L.replace(timeRange[0], '').trim();
      if (!title && lines[i+1]) title = lines[i+1].trim();
      const day = currentDay || 1;
      if (start != null && end != null) {
        slots.push({ dayOfWeek: day, startMinutes: start, endMinutes: end, title });
      }
    }
  }

  return slots;
}

module.exports = { parseOcrTextToSlots };
