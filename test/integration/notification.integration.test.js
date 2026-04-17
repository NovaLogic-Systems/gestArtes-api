const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();

const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const missingEnv = ['DATABASE_URL', 'TEST_LOGIN_EMAIL', 'TEST_LOGIN_PASSWORD'].filter(
    (key) => !process.env[key]
);

if (!shouldRun) {
    test(
        'Notification integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true',
        { skip: true },
        () => { }
    );
} else if (missingEnv.length > 0) {
    test(
        `Notification integration tests are skipped due to missing env vars: ${missingEnv.join(', ')}`,
        { skip: true },
        () => { }
    );
} else {

    const app = require('../../src/app');
    const prisma = require('../../src/config/prisma');
    const notificationService = require('../../src/services/notification.service');

    let server;
    let baseUrl = '';
    let sessionCookie = '';
    let loggedUserId = null;
    const createdNotificationIds = new Set();

    async function request(path, options = {}) {
        const headers = { ...(options.headers || {}) };

        if (sessionCookie) {
            headers.Cookie = sessionCookie;
        }

        const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers,
        });

        const setCookieHeader =
            (typeof response.headers.getSetCookie === 'function'
                ? response.headers.getSetCookie()[0]
                : null) || response.headers.get('set-cookie');

        if (setCookieHeader) {
            sessionCookie = setCookieHeader.split(';')[0];
        }

        return response;
    }

    async function createTrackedNotification(userId, message) {
        const created = await notificationService.create(userId, message);
        createdNotificationIds.add(created.id);
        return created;
    }

    test.before(async () => {
        const typeOne = await prisma.notificationType.findUnique({
            where: { TypeID: 1 },
        });

        if (!typeOne) {
            throw new Error(
                'NotificationType TypeID=1 is required for notificationService.create() in current model'
            );
        }

        server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));

        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;

        const loginResponse = await request('/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                email: process.env.TEST_LOGIN_EMAIL,
                password: process.env.TEST_LOGIN_PASSWORD,
            }),
        });

        assert.equal(loginResponse.status, 200, 'Falha no login de teste');

        const meResponse = await request('/auth/me');
        assert.equal(meResponse.status, 200, 'Falha ao obter utilizador autenticado');

        const meBody = await meResponse.json();
        loggedUserId = meBody?.user?.userId;
        assert.ok(loggedUserId, 'Nao foi possivel obter userId da sessao');
    });

    test.after(async () => {
        if (createdNotificationIds.size > 0) {
            await prisma.notification.deleteMany({
                where: {
                    NotificationID: {
                        in: [...createdNotificationIds],
                    },
                },
            });
        }

        await prisma.$disconnect();

        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
        }
    });

    test('GET /notifications devolve apenas notificacoes do user logado', async (t) => {
        const otherUser = await prisma.user.findFirst({
            where: {
                UserID: { not: loggedUserId },
                IsActive: true,
            },
            orderBy: { UserID: 'asc' },
        });

        if (!otherUser) {
            t.skip('Nao existe outro utilizador ativo para validar isolamento por userId');
            return;
        }

        const own = await createTrackedNotification(
            loggedUserId,
            `INT-GET-own-${Date.now()}`
        );
        const foreign = await createTrackedNotification(
            otherUser.UserID,
            `INT-GET-foreign-${Date.now()}`
        );

        const response = await request('/notifications');
        assert.equal(response.status, 200, 'GET /notifications deve devolver 200');

        const notifications = await response.json();
        assert.ok(Array.isArray(notifications), 'Resposta deve ser array');

        assert.ok(
            notifications.every((n) => n.userId === loggedUserId),
            'Todas as notificacoes devolvidas devem pertencer ao utilizador autenticado'
        );

        assert.ok(
            notifications.some((n) => n.id === own.id),
            'A notificacao do utilizador logado deve aparecer no resultado'
        );

        assert.ok(
            !notifications.some((n) => n.id === foreign.id),
            'Notificacoes de outros utilizadores nao devem aparecer'
        );
    });

    test('PATCH /notifications/:id/read muda isRead para 1', async () => {
        const created = await createTrackedNotification(
            loggedUserId,
            `INT-PATCH-${Date.now()}`
        );

        const patchResponse = await request(`/notifications/${created.id}/read`, {
            method: 'PATCH',
        });

        assert.equal(
            patchResponse.status,
            200,
            'PATCH /notifications/:id/read deve devolver 200'
        );

        const patchBody = await patchResponse.json();
        assert.equal(patchBody.success, true, 'Resposta deve indicar sucesso');

        const dbRow = await prisma.notification.findUnique({
            where: { NotificationID: created.id },
        });

        assert.ok(dbRow, 'Notificacao deve existir na BD');
        assert.equal(dbRow.IsRead, true, 'Campo IsRead deve ficar true (1)');
    });

    test('outro modulo consegue chamar notificationService.create(userId, msg)', async () => {
        const message = `INT-SERVICE-${Date.now()}`;
        const created = await createTrackedNotification(loggedUserId, message);

        assert.ok(created.id, 'create deve devolver id');
        assert.equal(created.userId, loggedUserId);
        assert.equal(created.message, message);
        assert.equal(created.isRead, false);

        const dbRow = await prisma.notification.findUnique({
            where: { NotificationID: created.id },
        });

        assert.ok(dbRow, 'Registo criado deve existir na BD');
        assert.equal(dbRow.UserID, loggedUserId);
        assert.equal(dbRow.Message, message);
        assert.equal(dbRow.IsRead, false);
    });
}