/**
 * @file src/controllers/finance.controller.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const prisma = require('../config/prisma');
const { createFinanceService } = require('../services/finance.service');

const financeService = createFinanceService(prisma);

async function listTransactions(req, res, next) {
  try {
    const { periodStart, periodEnd, studentAccountId, studentNumber, entryType, isExported, limit, offset } = req.query;
    const result = await financeService.listTransactions({
      periodStart,
      periodEnd,
      studentAccountId,
      studentNumber,
      entryType,
      isExported,
      limit: limit ?? 50,
      offset: offset ?? 0,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getSummary(req, res, next) {
  try {
    const { periodStart, periodEnd, studentAccountId, studentNumber } = req.query;
    const result = await financeService.getSummary({ periodStart, periodEnd, studentAccountId, studentNumber });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getRevenue(req, res, next) {
  try {
    const { year, studentAccountId, studentNumber } = req.query;
    const result = await financeService.getRevenue({ year, studentAccountId, studentNumber });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function exportTransactions(req, res, next) {
  try {
    const { periodStart, periodEnd, studentAccountId, studentNumber, includeExported } = req.body;
    const userId = req.auth?.userId ?? null;

    const { csv, count } = await financeService.exportTransactions({
      periodStart,
      periodEnd,
      studentAccountId,
      studentNumber,
      includeExported: includeExported ?? false,
      userId,
    });

    const dateTag = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="financeiro_${dateTag}.csv"`);
    res.setHeader('X-Export-Count', String(count));
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = { listTransactions, getSummary, getRevenue, exportTransactions };

