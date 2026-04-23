const { Prisma } = require('@prisma/client');
const { toCsv } = require('../utils/csv');
const { logAudit, AUDIT_ACTIONS, AUDIT_MODULES, AUDIT_RESULTS } = require('../utils/audit');

const CSV_COLUMNS = [
  { header: 'ID', key: 'entryId' },
  { header: 'Sessão ID', key: 'sessionId' },
  { header: 'Tipo', key: 'entryType' },
  { header: 'Valor (€)', value: (r) => Number(r.amount).toFixed(2) },
  { header: 'Data', value: (r) => r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt) },
  { header: 'Aluno', key: 'studentName' },
  { header: 'Nº Aluno', key: 'studentNumber' },
];

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function createFinanceService(prismaClient) {
  async function _resolveStudentAccountId(studentNumber) {
    if (!studentNumber) return null;
    const account = await prismaClient.studentAccount.findFirst({
      where: { User: { AuthUID: studentNumber } },
      select: { StudentAccountID: true },
    });
    return account?.StudentAccountID ?? null;
  }

  function _buildWhere({ periodStart, periodEnd, resolvedStudentAccountId, entryType, isExported }) {
    const where = {};
    if (periodStart || periodEnd) {
      where.CreatedAt = {};
      if (periodStart) where.CreatedAt.gte = periodStart;
      if (periodEnd) where.CreatedAt.lte = periodEnd;
    }
    if (entryType) where.FinancialEntryType = { TypeName: entryType };
    if (isExported !== undefined) where.IsExported = isExported;
    if (resolvedStudentAccountId) {
      where.CoachingSession = {
        SessionStudent: { some: { StudentAccountID: resolvedStudentAccountId } },
      };
    }
    return where;
  }

  function _mapEntry(e) {
    const firstSS = e.CoachingSession?.SessionStudent?.[0];
    const studentUser = firstSS?.StudentAccount?.User;
    return {
      entryId: e.EntryID,
      sessionId: e.SessionID,
      amount: Number(e.Amount),
      entryType: e.FinancialEntryType?.TypeName ?? null,
      createdAt: e.CreatedAt,
      isExported: e.IsExported,
      exportedBy: e.User ? `${e.User.FirstName} ${e.User.LastName ?? ''}`.trim() : null,
      studentAccountId: firstSS?.StudentAccountID ?? null,
      studentName: studentUser ? `${studentUser.FirstName} ${studentUser.LastName ?? ''}`.trim() : null,
      studentNumber: studentUser?.AuthUID ?? null,
    };
  }

  async function listTransactions({
    periodStart,
    periodEnd,
    studentAccountId,
    studentNumber,
    entryType,
    isExported,
    limit = 50,
    offset = 0,
  } = {}) {
    const resolvedStudentAccountId = studentAccountId ?? (await _resolveStudentAccountId(studentNumber));
    const where = _buildWhere({ periodStart, periodEnd, resolvedStudentAccountId, entryType, isExported });

    const [entries, total] = await Promise.all([
      prismaClient.financialEntry.findMany({
        where,
        include: {
          FinancialEntryType: true,
          CoachingSession: {
            include: {
              SessionStudent: {
                take: 1,
                orderBy: { StudentAccountID: 'asc' },
                include: { StudentAccount: { include: { User: true } } },
              },
            },
          },
          User: true,
        },
        orderBy: { CreatedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prismaClient.financialEntry.count({ where }),
    ]);

    return { items: entries.map(_mapEntry), total, limit, offset };
  }

  async function getSummary({ periodStart, periodEnd, studentAccountId, studentNumber } = {}) {
    const resolvedStudentAccountId = studentAccountId ?? (await _resolveStudentAccountId(studentNumber));

    const conditions = [];
    if (periodStart) conditions.push(Prisma.sql`fe.CreatedAt >= ${periodStart}`);
    if (periodEnd) conditions.push(Prisma.sql`fe.CreatedAt <= ${periodEnd}`);
    if (resolvedStudentAccountId) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM SessionStudent ss WHERE ss.SessionID = fe.SessionID AND ss.StudentAccountID = ${resolvedStudentAccountId})`
      );
    }

    const whereClause = conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const rows = await prismaClient.$queryRaw(Prisma.sql`
      SELECT
        fet.TypeName AS typeName,
        COUNT(*) AS cnt,
        CAST(SUM(fe.Amount) AS FLOAT) AS total,
        SUM(CASE WHEN fe.IsExported = 1 THEN 1 ELSE 0 END) AS exportedCount,
        SUM(CASE WHEN fe.IsExported = 0 THEN 1 ELSE 0 END) AS unexportedCount
      FROM FinancialEntry fe
      INNER JOIN FinancialEntryType fet ON fet.EntryTypeID = fe.EntryTypeID
      ${whereClause}
      GROUP BY fet.TypeName
    `);

    const totalsByType = {};
    let totalRevenue = 0;
    let totalPenalties = 0;
    let totalEntries = 0;
    let exportedCount = 0;
    let unexportedCount = 0;

    for (const row of rows) {
      const count = Number(row.cnt);
      const total = Number(row.total);
      const exported = Number(row.exportedCount);
      const unexported = Number(row.unexportedCount);
      totalsByType[row.typeName] = { count, total: Number(total.toFixed(2)) };
      totalEntries += count;
      exportedCount += exported;
      unexportedCount += unexported;
      if (row.typeName === 'SESSION') totalRevenue += total;
      else totalPenalties += total;
    }

    return {
      periodStart: periodStart ?? null,
      periodEnd: periodEnd ?? null,
      totalsByType,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalPenalties: Number(totalPenalties.toFixed(2)),
      totalEntries,
      exportedCount,
      unexportedCount,
    };
  }

  async function getRevenue({ year, studentAccountId, studentNumber } = {}) {
    const resolvedStudentAccountId = studentAccountId ?? (await _resolveStudentAccountId(studentNumber));
    const targetYear = year ?? new Date().getFullYear();

    const conditions = [Prisma.sql`YEAR(fe.CreatedAt) = ${targetYear}`];
    if (resolvedStudentAccountId) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM SessionStudent ss WHERE ss.SessionID = fe.SessionID AND ss.StudentAccountID = ${resolvedStudentAccountId})`
      );
    }

    const rows = await prismaClient.$queryRaw(Prisma.sql`
      SELECT
        MONTH(fe.CreatedAt) AS month,
        CAST(SUM(CASE WHEN fet.TypeName = 'SESSION' THEN fe.Amount ELSE 0 END) AS FLOAT) AS revenue,
        CAST(SUM(CASE WHEN fet.TypeName IN ('NOSHOWPENALTY', 'CANCELLATIONFEE') THEN fe.Amount ELSE 0 END) AS FLOAT) AS penalties,
        COUNT(CASE WHEN fet.TypeName = 'SESSION' THEN 1 ELSE NULL END) AS sessionCount
      FROM FinancialEntry fe
      INNER JOIN FinancialEntryType fet ON fet.EntryTypeID = fe.EntryTypeID
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY MONTH(fe.CreatedAt)
      ORDER BY MONTH(fe.CreatedAt) ASC
    `);

    const byMonth = new Map(rows.map((r) => [Number(r.month), r]));

    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const row = byMonth.get(m);
      return {
        month: m,
        label: MONTH_LABELS[i],
        revenue: row ? Number(row.revenue) : 0,
        penalties: row ? Number(row.penalties) : 0,
        sessionCount: row ? Number(row.sessionCount) : 0,
      };
    });

    return { year: targetYear, months };
  }

  async function exportTransactions({
    periodStart,
    periodEnd,
    studentAccountId,
    studentNumber,
    includeExported = false,
    userId,
  } = {}) {
    const resolvedStudentAccountId = studentAccountId ?? (await _resolveStudentAccountId(studentNumber));
    const where = _buildWhere({
      periodStart,
      periodEnd,
      resolvedStudentAccountId,
      entryType: undefined,
      isExported: includeExported ? undefined : false,
    });

    const { csv, count } = await prismaClient.$transaction(async (tx) => {
      const entries = await tx.financialEntry.findMany({
        where,
        include: {
          FinancialEntryType: true,
          CoachingSession: {
            include: {
              SessionStudent: {
                take: 1,
                orderBy: { StudentAccountID: 'asc' },
                include: { StudentAccount: { include: { User: true } } },
              },
            },
          },
        },
        orderBy: { CreatedAt: 'asc' },
      });

      if (entries.length > 0) {
        await tx.financialEntry.updateMany({
          where: {
            EntryID: { in: entries.map((e) => e.EntryID) },
            IsExported: false,
          },
          data: { IsExported: true, ExportedByUserID: userId },
        });
      }

      const rows = entries.map((e) => {
        const firstSS = e.CoachingSession?.SessionStudent?.[0];
        const studentUser = firstSS?.StudentAccount?.User;
        return {
          entryId: e.EntryID,
          sessionId: e.SessionID,
          entryType: e.FinancialEntryType?.TypeName ?? '',
          amount: Number(e.Amount),
          createdAt: e.CreatedAt,
          studentName: studentUser ? `${studentUser.FirstName} ${studentUser.LastName ?? ''}`.trim() : '',
          studentNumber: studentUser?.AuthUID ?? '',
        };
      });

      return { csv: toCsv(rows, CSV_COLUMNS), count: entries.length };
    });

    logAudit({
      userId,
      action: AUDIT_ACTIONS.FINANCE_EXPORT,
      module: AUDIT_MODULES.FINANCE,
      result: AUDIT_RESULTS.SUCCESS,
      detail: `Exported ${count} entries`,
    });

    return { csv, count };
  }

  return { listTransactions, getSummary, getRevenue, exportTransactions };
}

module.exports = { createFinanceService };
