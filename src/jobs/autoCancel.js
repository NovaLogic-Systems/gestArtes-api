const cron = require('node-cron');
const db = require('../config/db');

const STATUS_AWAITING_APPROVAL = 1;
const STATUS_CANCELLED = 5;
const EXPIRATION_HOURS = 48;

// Schedule the job to run every hour
cron.schedule('0 * * * *', async () => {
    console.log('Sistema de cancelamento automático em execução...');

    try {
        const expiredSessions = await db.query(
            `SELECT SessionID
             FROM Sessions
             WHERE StatusID = @awaitingApproval
               AND SessionDate <= DATEADD(HOUR, -@expirationHours, GETDATE())`,
            {
                awaitingApproval: STATUS_AWAITING_APPROVAL,
                expirationHours: EXPIRATION_HOURS
            }
        );

        for (const session of expiredSessions.recordset) {
            await db.query(
                `UPDATE Sessions
                 SET StatusID = @cancelled
                 WHERE SessionID = @sessionId
                   AND StatusID = @awaitingApproval`,
                {
                    sessionId: session.SessionID,
                    cancelled: STATUS_CANCELLED,
                    awaitingApproval: STATUS_AWAITING_APPROVAL
                }
            );
        }

        console.log(`Sessoes canceladas: ${expiredSessions.recordset.length}`);
    } catch (err) {
        console.error('Erro no cancelamento automatico:', err.message);
    }
});