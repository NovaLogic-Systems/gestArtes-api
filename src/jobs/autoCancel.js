const cron = require('node-cron');
const prisma = require('../config/prisma');

const STATUS_AWAITING_APPROVAL = 1;
const STATUS_CANCELLED = 5;
const EXPIRATION_HOURS = 48;

// Schedule the job to run every hour
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