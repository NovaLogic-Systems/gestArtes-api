/**
 * Seed: ent'artes 2025/2026 timetables (informational only — not linked to coaching).
 *
 * Maps are grouped by público: Regime Intensivo (0/2/3), Kids/Jovens turmas gerais
 * (per modality), Adultos, Complementar and Competição. Teacher names are stored as
 * free text in the slot Notes (the people in the PDFs are not platform users).
 *
 * Run with: npm run prisma:seed:entartes
 */
require('dotenv/config')
const prisma = require('../src/config/prisma')

const DAY = { SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6 }

// Parse "18h00" / "18:00" / "9h30" into minutes from midnight.
function t(value) {
  const m = String(value).match(/^(\d{1,2})[h:](\d{2})$/)
  if (!m) throw new Error(`Hora inválida: ${value}`)
  return Number(m[1]) * 60 + Number(m[2])
}

// slot helper: s(day, start, end, title, teacher)
function s(day, start, end, title, teacher) {
  return { day, start: t(start), end: t(end), title, teacher: teacher || null }
}

const COLORS = {
  ri0: '#0E7490',
  ri1: '#0369A1',
  ri2: '#4338CA',
  ri3: '#6D28D9',
  ballet: '#BE185D',
  jazz: '#B45309',
  contemp: '#1D4ED8',
  acro: '#15803D',
  acrodance: '#DB2777',
  outras: '#4F46E5',
  competicao: '#BE123C',
  adultos: '#0F766E',
  complementar: '#16A34A',
  studio: '#166534',
}

const MAPS = [
  // ──────────────────────────── REGIME INTENSIVO ────────────────────────────
  {
    label: 'Regime Intensivo 0',
    color: COLORS.ri0,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h00', '19h00', 'Ballet Clássico RI0', 'Natália Azevedo'),
      s(DAY.SEG, '19h00', '20h00', 'DC Intensivo 0', 'Bárbara Magalhães'),
      s(DAY.SEG, '20h00', '20h30', 'Cond. Físico RI0', 'Rodolfo Iocca'),
      s(DAY.TER, '18h00', '19h00', 'Jazz Intensivo 0', 'Edson Nascimento'),
      s(DAY.TER, '19h00', '20h00', 'Ballet Clássico RI0', 'Rodolfo Iocca'),
      s(DAY.QUA, '18h00', '19h00', 'Oficinas Rapazes', 'Bárbara Magalhães'),
      s(DAY.QUA, '18h45', '19h45', 'Ballet RI0 — Pré Ponta', 'Natália Azevedo'),
      s(DAY.QUA, '20h00', '21h10', 'DC Intensivo 0', 'Bárbara Magalhães'),
      s(DAY.SEX, '18h00', '19h00', 'Aula Rapazes RI0/1/2/3', 'Rodolfo Iocca'),
      s(DAY.SEX, '19h00', '20h00', 'Cond. Físico RI0 e RI1', 'Rodolfo Iocca'),
      s(DAY.SEX, '20h00', '21h00', 'Aula Ballet RI0 e RI1', 'Rodolfo Iocca'),
      s(DAY.SAB, '09h30', '10h30', 'Jazz Intensivo 0', 'Edson Nascimento'),
      s(DAY.SAB, '10h30', '12h30', 'Aula Ballet + Ensaio + Cond. RI0', 'Maria Borges'),
    ],
  },
  {
    label: 'Regime Intensivo 1',
    color: COLORS.ri1,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h00', '19h00', 'Cond. Físico RI1', 'Alexandra Galvão'),
      s(DAY.SEG, '19h00', '20h00', 'Ballet Clássico RI1', 'Rodolfo Iocca'),
      s(DAY.SEG, '20h00', '21h00', 'DC Intensivo 1', 'Sara Vilas Boas'),
      s(DAY.TER, '18h00', '19h00', 'Aula RI1', 'Rodolfo Iocca'),
      s(DAY.QUA, '18h00', '19h00', 'Oficinas Rapazes', 'Bárbara Magalhães'),
      s(DAY.QUA, '19h15', '20h15', 'Jazz Intensivo 1', 'Edson Nascimento'),
      s(DAY.QUA, '20h15', '21h00', 'Ballet RI1 — Pré Ponta', 'Natália Azevedo'),
      s(DAY.QUI, '18h00', '18h30', 'Jazz Rapazes', 'Edson Nascimento'),
      s(DAY.QUI, '18h30', '19h30', 'Jazz Intensivo 1', 'Edson Nascimento'),
      s(DAY.SEX, '18h00', '19h00', 'Aula Rapazes RI0/1/2/3', 'Rodolfo Iocca'),
      s(DAY.SEX, '19h00', '20h00', 'Cond. Físico RI1 e RI0', 'Rodolfo Iocca'),
      s(DAY.SEX, '20h00', '21h00', 'Ballet Clássico RI1 e RI0', 'Rodolfo Iocca'),
      s(DAY.SAB, '10h30', '12h00', 'Ballet Clássico + Ensaio RI1', 'Rodolfo Iocca'),
      s(DAY.SAB, '12h15', '13h30', 'DC Intensivo 1', 'Filipe Narciso'),
    ],
  },
  {
    label: 'Regime Intensivo 2',
    color: COLORS.ri2,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h00', '19h00', 'Cond. Físico RI1/RI2/RI3', 'Alexandra Galvão'),
      s(DAY.SEG, '19h00', '21h15', 'Ballet Clássico + Ofic. Coreográfica RI2/RI3', 'Professores Convidados'),
      s(DAY.TER, '18h00', '19h45', 'Ballet Clássico RI2/RI3', 'Laura Aguero'),
      s(DAY.TER, '19h55', '21h30', 'Ofic. Coreográfica + Aula Caracter + Aula Pontas I RI2', 'Laura Aguero'),
      s(DAY.QUA, '18h00', '18h45', 'Aula Pontas RI2', 'Philipp Knapp'),
      s(DAY.QUA, '19h00', '20h15', 'Ballet Clássico RI2', 'Maria Borges'),
      s(DAY.QUA, '20h15', '21h30', 'Jazz Intensivo RI2', 'Edson Nascimento'),
      s(DAY.QUI, '18h00', '19h45', 'DC Intensivo 2', 'Filipe Narciso'),
      s(DAY.QUI, '20h00', '21h30', 'Ballet Clássico + Pontas + Ensaios I RI2', 'Philipp Knapp'),
      s(DAY.SEX, '18h00', '19h00', 'Aula Rapazes RI0/1/2/3', 'Rodolfo Iocca'),
      s(DAY.SEX, '19h00', '20h00', 'RI2 Pontas + Flexibilidade', 'Maria Borges'),
      s(DAY.SEX, '20h00', '21h30', 'DC Intensivo 2', 'Filipe Narciso'),
      s(DAY.SAB, '10h30', '12h15', 'DC Intensivo 2', 'Filipe Narciso'),
      s(DAY.SAB, '12h15', '13h45', 'Jazz Intensivo 2', 'Edson Nascimento'),
      s(DAY.SAB, '14h30', '16h00', 'Aula RI2 — Exame RAD', 'Natália Azevedo'),
    ],
  },
  {
    label: 'Regime Intensivo 3',
    color: COLORS.ri3,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h00', '19h00', 'Cond. Físico RI1/RI2/RI3', 'Alexandra Galvão'),
      s(DAY.SEG, '19h00', '21h15', 'Ballet Clássico + Ensaio Repertório RI2/RI3', 'Professores Convidados'),
      s(DAY.TER, '18h00', '19h45', 'Ballet Clássico RI2/RI3', 'Laura Aguero'),
      s(DAY.TER, '20h00', '21h30', 'Jazz Intensivo 3 + Ensaios', 'Edson Nascimento'),
      s(DAY.QUA, '19h00', '21h30', 'Ballet Clássico + Ensaio Repertório + Pontas RI3', 'Philipp Knapp'),
      s(DAY.QUI, '18h00', '19h45', 'Ballet Clássico + Ensaio Repertório + Pontas RI3', 'Philipp Knapp'),
      s(DAY.QUI, '19h45', '21h30', 'DC Intensivo 3 + Ensaios', 'Filipe Narciso'),
      s(DAY.SEX, '18h00', '19h00', 'Aula Rapazes RI0/1/2/3', 'Rodolfo Iocca'),
      s(DAY.SEX, '18h00', '20h00', 'DC Intensivo 3 + Ensaios', 'Filipe Narciso'),
      s(DAY.SEX, '20h00', '21h30', 'Ballet Clássico RAD RI3', 'Natália Azevedo'),
      s(DAY.SAB, '09h00', '10h30', 'Ballet Clássico RAD — RI3', 'Natália Azevedo'),
      s(DAY.SAB, '10h30', '12h00', 'Jazz RI3', 'Edson Nascimento'),
      s(DAY.SAB, '12h15', '13h30', 'Ensaio + Cond. Físico + Pontas RI3', 'Rodolfo Iocca'),
      s(DAY.SAB, '14h30', '16h30', 'DC Intensivo 3 + Ensaios', 'Filipe Narciso'),
    ],
  },

  // ──────────────────────── KIDS / JOVENS — TURMAS GERAIS ────────────────────────
  {
    label: 'Ballet — Turmas Gerais',
    color: COLORS.ballet,
    isActive: true,
    slots: [
      s(DAY.SEG, '18h00', '18h45', 'Preparatório 2 (7 anos)', 'Filipa Tenreiro'),
      s(DAY.SEG, '18h00', '19h00', 'Grau 2/3 (11 anos)', 'Bárbara Magalhães'),
      s(DAY.SEG, '19h00', '19h45', 'Grau 6 — Of. Coreo', 'Natália Azevedo'),
      s(DAY.SEG, '19h45', '21h00', 'Grau 6 (+12 anos)', 'Natália Azevedo'),
      s(DAY.TER, '18h00', '18h45', 'Primary (8 anos)', 'Natália Azevedo'),
      s(DAY.TER, '18h00', '18h45', 'Pre Primary (6 anos)', 'Daniela Fernandes'),
      s(DAY.TER, '18h45', '19h45', 'Grau 1/2 (10 anos)', 'Natália Azevedo'),
      s(DAY.TER, '19h45', '20h45', 'Grau 4 (12 anos)', 'Natália Azevedo'),
      s(DAY.QUA, '18h00', '18h45', 'Baby Class II (4 anos)', 'Natália Azevedo'),
      s(DAY.QUA, '18h00', '18h45', 'Preparatório 1 (5 anos)', 'Daniela Fernandes'),
      s(DAY.QUA, '18h00', '19h00', 'Grau 1 (9 anos)', 'Maria Borges'),
      s(DAY.QUA, '19h00', '20h00', 'Grau 2/3 (11 anos)', 'Bárbara Magalhães'),
      s(DAY.QUA, '19h00', '20h00', 'Vocacional 2 — Pontas', 'Diana Faria / Diana Sá Carneiro'),
      s(DAY.QUA, '20h00', '21h00', 'Vocacional 2 — Of. Coreo', 'Maria Borges'),
      s(DAY.QUI, '18h00', '18h45', 'Baby Class I (3 anos)', 'Natália Azevedo'),
      s(DAY.QUI, '18h00', '18h45', 'Pre Primary (6 anos)', 'Daniela Fernandes'),
      s(DAY.QUI, '18h45', '19h45', 'Grau 6 (+12 anos)', 'Natália Azevedo'),
      s(DAY.QUI, '19h45', '20h45', 'Grau 4 (12 anos)', 'Natália Azevedo'),
      s(DAY.SEX, '18h00', '18h45', 'Primary (8 anos)', 'Natália Azevedo'),
      s(DAY.SEX, '18h00', '18h45', 'Preparatório 2 (7 anos)', 'Filipa Tenreiro'),
      s(DAY.SEX, '18h00', '18h45', 'Preparatório 1 (5 anos)', 'Daniela Fernandes'),
      s(DAY.SEX, '18h00', '19h00', 'Grau 1 (9 anos)', 'Maria Borges'),
      s(DAY.SEX, '18h45', '19h45', 'Grau 1/2 (10 anos)', 'Natália Azevedo'),
      s(DAY.SEX, '20h00', '21h30', 'Vocacional 2 — Exame RAD', 'Natália Azevedo'),
      s(DAY.SAB, '09h00', '10h30', 'Vocacional 2 — RAD', 'Natália Azevedo'),
      s(DAY.SAB, '11h15', '12h00', 'Baby Class I/II (3-4 anos)', 'Natália Azevedo'),
      s(DAY.SAB, '12h00', '12h45', 'Pre Primary (6 anos)', 'Daniela Fernandes'),
      s(DAY.SAB, '12h00', '12h45', 'Preparatório 1 (5 anos)', 'Natália Azevedo'),
      s(DAY.SAB, '12h00', '12h45', 'Primary (8 anos)', 'Diana Faria'),
    ],
  },
  {
    label: 'Jazz — Turmas Gerais',
    color: COLORS.jazz,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h00', '19h00', 'Jazz 1 (4-6 anos)', 'Ana Luís Gomes'),
      s(DAY.TER, '19h00', '20h00', 'Jazz Teens (+13 anos)', 'Edson Nascimento'),
      s(DAY.QUA, '18h00', '18h45', 'Jazz 2 (7-12 anos)', 'Ana Luís Gomes'),
      s(DAY.QUI, '18h00', '18h30', 'Jazz Rapazes', 'Edson Nascimento'),
      s(DAY.SEX, '19h00', '19h45', 'Jazz 2 (7-12 anos)', 'Ana Luís Gomes'),
    ],
  },
  {
    label: 'Contemporâneo — Turmas Gerais',
    color: COLORS.contemp,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h00', '19h00', 'Dança Contemporânea Iniciação — DCi 1 (6-8 anos)', 'Sara Vilas Boas'),
      s(DAY.SEG, '19h00', '20h00', 'Dança Contemporânea C — DCC 1 (9-11 anos)', 'Sara Vilas Boas'),
      s(DAY.SEG, '20h00', '21h15', 'Dança Contemporânea B — DCB (+12 anos)', 'Bárbara Magalhães'),
      s(DAY.QUA, '18h00', '19h00', 'DC Oficinas Rapazes', 'Bárbara Magalhães'),
      s(DAY.SAB, '09h30', '10h30', 'Dança Contemporânea Iniciação — DCi 2 (6-8 anos)', 'Bárbara Magalhães'),
      s(DAY.SAB, '10h30', '11h30', 'Dança Contemporânea C — DCC 2 (9-11 anos)', 'Bárbara Magalhães'),
      s(DAY.SAB, '11h45', '13h15', 'Dança Contemporânea B — DCB (+12 anos)', 'Bárbara Magalhães'),
    ],
  },
  {
    label: 'Acrobática — Turmas Gerais',
    color: COLORS.acro,
    isActive: false,
    slots: [
      s(DAY.TER, '18h00', '19h00', 'Acrokids A (4-5 anos)', 'Sara Vilas Boas'),
      s(DAY.TER, '19h00', '20h30', 'G. Acrobática — Turma A', 'Sara Vilas Boas'),
      s(DAY.QUI, '18h00', '19h15', 'G. Acrobática Iniciação (+6 anos)', 'Sara Vilas Boas'),
      s(DAY.QUI, '19h15', '20h45', 'G. Acrobática — Turma A', 'Sara Vilas Boas'),
    ],
  },
  {
    label: 'Acrodance',
    color: COLORS.acrodance,
    isActive: false,
    slots: [
      s(DAY.SEG, '19h00', '20h00', 'Acrodance I (7-9 anos)', 'Ana Luís Gomes'),
      s(DAY.QUA, '18h45', '19h45', 'Acrodance II (+10 anos)', 'Ana Luís Gomes'),
      s(DAY.SEX, '18h00', '19h00', 'Acrodance I/II', 'Ana Luís Gomes'),
    ],
  },
  {
    label: 'Outras Modalidades',
    color: COLORS.outras,
    isActive: false,
    slots: [
      s(DAY.SEG, '20h00', '21h00', 'Teatro Musical', 'Ana Luís Gomes'),
      s(DAY.QUA, '19h45', '21h00', 'Comercial e Fusion', 'Ana Luís Gomes'),
      s(DAY.SEX, '19h45', '20h45', 'Teatro Musical', 'Ana Luís Gomes'),
      s(DAY.SAB, '09h30', '10h30', 'Hip Hop Kids/Teens', 'Anabela Santos'),
    ],
  },

  // ──────────────────────────────── ADULTOS ────────────────────────────────
  {
    label: 'Modalidades para Adultos',
    color: COLORS.adultos,
    isActive: false,
    slots: [
      s(DAY.SEG, '20h30', '21h30', 'Ballet Adultos — Intermédio', 'Rodolfo Iocca'),
      s(DAY.TER, '20h45', '21h45', 'PBT (Nível Aberto)', 'Natália Azevedo'),
      s(DAY.QUA, '21h00', '22h00', 'Ballet Adultos — Iniciação', 'Natália Azevedo'),
      s(DAY.QUI, '19h30', '20h30', 'Body Balance', 'Edson Nascimento'),
      s(DAY.QUI, '20h30', '22h00', 'Jazz Adultos', 'Edson Nascimento'),
      s(DAY.SEX, '19h00', '20h00', 'Sevilhanas & Flamenco', 'Carolina Corrêa'),
      s(DAY.SEX, '21h30', '22h30', 'Dança Contemporânea Adultos', 'Filipe Narciso'),
      s(DAY.SAB, '09h00', '10h30', 'Ballet Adultos — Intermédio', 'Rodolfo Iocca'),
      s(DAY.SAB, '10h30', '11h15', 'Flexibilidade', 'Natália Azevedo'),
    ],
  },

  // ─────────────────────────────── COMPLEMENTAR ───────────────────────────────
  {
    label: 'Aulas Complementares',
    color: COLORS.complementar,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h00', '19h00', 'Cond. Físico RI1/RI2/RI3', 'Alexandra Galvão'),
      s(DAY.SEG, '20h00', '20h30', 'Cond. Físico RI0', 'Rodolfo Iocca'),
      s(DAY.TER, '20h45', '21h45', 'PBT (Nível Aberto)', 'Natália Azevedo'),
      s(DAY.QUI, '19h30', '20h30', 'Body Balance', 'Edson Nascimento'),
      s(DAY.SEX, '19h00', '20h00', 'Cond. Físico RI1 e RI0', 'Rodolfo Iocca'),
      s(DAY.SAB, '10h30', '11h15', 'Flexibilidade', 'Natália Azevedo'),
      s(DAY.SAB, '12h15', '13h30', 'Ensaio + Cond. Físico RI3', 'Rodolfo Iocca'),
    ],
  },
  {
    label: 'Studio Training',
    color: COLORS.studio,
    isActive: false,
    slots: [
      s(DAY.QUA, '19h40', '20h20', 'PBT (Nível Aberto)', 'Natália Azevedo'),
      s(DAY.QUI, '19h30', '20h30', 'Body Balance', 'Edson Nascimento'),
      s(DAY.SAB, '10h30', '11h15', 'Flexibilidade', 'Natália Azevedo'),
    ],
  },

  // ─────────────────────────────── COMPETIÇÃO ───────────────────────────────
  {
    label: 'Acrobática — Competição',
    color: COLORS.competicao,
    isActive: false,
    slots: [
      s(DAY.SEG, '18h45', '20h45', 'G. Acrobática Competição', 'Alexandra Galvão / Joana Moreira'),
      s(DAY.QUA, '17h15', '18h15', 'G. Acro. Competição — A', 'Edson Nascimento'),
      s(DAY.QUA, '18h15', '19h15', 'G. Acro. Competição — B', 'Edson Nascimento'),
      s(DAY.SEX, '18h45', '20h45', 'G. Acrobática Competição', 'Alexandra Galvão / Joana Moreira'),
      s(DAY.SAB, '10h30', '12h30', 'G. Acrobática Competição (Escola: Sá de Miranda)', 'Alexandra Galvão / Joana Moreira'),
    ],
  },
]

async function main() {
  let mapCount = 0
  let slotCount = 0

  // "Substituir pelos reais": clear existing timetables (slots cascade) and reseed.
  await prisma.TimetableSlot.deleteMany({})
  await prisma.Timetable.deleteMany({})

  for (const map of MAPS) {
    await prisma.Timetable.create({
      data: {
        Label: map.label,
        IsActive: Boolean(map.isActive),
        CreatedBy: null,
        Slots: {
          create: map.slots.map((slot) => ({
            DayOfWeek: slot.day,
            StartMinutes: slot.start,
            EndMinutes: slot.end,
            Title: slot.title,
            TeacherUserID: null,
            StudioID: null,
            Color: map.color,
            Notes: slot.teacher,
          })),
        },
      },
    })
    mapCount += 1
    slotCount += map.slots.length
  }

  console.log(`[seed:entartes] ${mapCount} mapas e ${slotCount} blocos inseridos.`)
}

main()
  .catch((error) => {
    console.error('[seed:entartes]', error?.message || error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect?.()
  })
