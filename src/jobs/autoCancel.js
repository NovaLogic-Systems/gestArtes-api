/**
 * @file src/jobs/autoCancel.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const cron = require('node-cron');
const prisma = require('../config/prisma');

const STATUS_AWAITING_APPROVAL = 1;
const STATUS_CANCELLED = 5;
const EXPIRATION_HOURS = 48;

// Agenda a execução da tarefa para correr de hora a hora
cron.schedule('0 * * * *', async () => {
    console.log('Sistema de cancelamento automático em execução...');

    try {
        const expirationDate = new Date(Date.now() - EXPIRATION_HOURS * 60 * 60 * 1000);

        const result = await prisma.coachingSession.updateMany({
            where: {
                StatusID: STATUS_AWAITING_APPROVAL,
                CreatedAt: {
                    lte: expirationDate,
                },
            },
            data: {
                StatusID: STATUS_CANCELLED,
                CancellationReason: 'Cancelamento automático por expiração',
            },
        });

        console.log(`Sessoes canceladas: ${result.count}`);
    } catch (err) {
        console.error('Erro no cancelamento automatico:', err.message);
    }
});
