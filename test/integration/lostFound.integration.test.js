/**
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const missingEnv = ['DATABASE_URL'].filter((key) => !process.env[key]);
const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

if (!shouldRun) {
  test('Testes de integração de Perdidos e Achados ignorados salvo RUN_DB_INTEGRATION_TESTS=true', { skip: true }, () => {});
} else if (missingEnv.length > 0) {
  test(`Testes de integração de Perdidos e Achados ignorados por falta de variáveis de ambiente: ${missingEnv.join(', ')}`, { skip: true }, () => {});
} else {
  const app = require('../../src/app');
  const prisma = require('../../src/config/prisma');

  const createdItemIds = [];

  let server;
  let baseUrl;
  let registeredByUserId;

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const text = await response.text();

    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return {
      status: response.status,
      headers: response.headers,
      body: json,
      text,
    };
  }

  function createAccessToken(userId, role) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    return jwt.sign(
      {
        sub: String(userId),
        userId,
        role: normalizedRole,
        roles: normalizedRole ? [normalizedRole] : [],
        tokenType: 'access',
      },
      process.env.JWT_ACCESS_SECRET || 'gestartes-dev-access-secret',
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRY || process.env.JWT_ACCESS_TTL || '15m',
        issuer: process.env.JWT_ISSUER || 'gestArtes-api',
        audience: process.env.JWT_AUDIENCE || 'gestArtes-web',
        jwtid: crypto.randomUUID(),
      }
    );
  }

  async function createLostFoundItem(overrides = {}) {
    const item = await prisma.lostAndFoundItem.create({
      data: {
        Title: overrides.Title ?? `Item-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        Description: overrides.Description ?? 'Test item',
        FoundDate: overrides.FoundDate ?? new Date(),
        ClaimedStatus: overrides.ClaimedStatus ?? false,
        PhotoURL: overrides.PhotoURL ?? null,
        IsArchived: overrides.IsArchived ?? false,
        AdminNotes: overrides.AdminNotes ?? null,
        ArchivedAt: overrides.ArchivedAt ?? null,
        RegisteredByUserID: overrides.RegisteredByUserID ?? registeredByUserId,
      },
    });

    createdItemIds.push(item.LostItemID);
    return item;
  }

  test.before(async () => {
    await prisma.$connect();

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    const user = await prisma.user.findFirst({
      where: { IsActive: true },
      select: { UserID: true },
    });

    registeredByUserId = user?.UserID ?? null;
  });

  test.after(async () => {
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

    if (createdItemIds.length > 0) {
      await prisma.lostAndFoundItem.deleteMany({
        where: {
          LostItemID: { in: createdItemIds },
        },
      });
    }

    await prisma.$disconnect();
  });

  // Lista pública e detalhe público
  test('lista pública não mostra itens arquivados', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const visible = await createLostFoundItem({ IsArchived: false });
    const archived = await createLostFoundItem({
      IsArchived: true,
      ArchivedAt: new Date(),
    });

    const response = await request('/lostfound');

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body));

    const ids = response.body.map((item) => item.id);
    assert.ok(ids.includes(visible.LostItemID));
    assert.equal(ids.includes(archived.LostItemID), false);
  });

  test('pedido público por id devolve 404 para item arquivado', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const archived = await createLostFoundItem({
      IsArchived: true,
      ArchivedAt: new Date(),
    });

    const response = await request(`/lostfound/${archived.LostItemID}`);

    assert.equal(response.status, 404);
  });

  // Endpoints de administração: claim e archive
  test('endpoint de claim do admin é idempotente', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const accessToken = createAccessToken(registeredByUserId, 'admin');

    const item = await createLostFoundItem({ ClaimedStatus: false });

    const first = await request(`/admin/lostfound/${item.LostItemID}/claim`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adminNotes: 'Claimed once' }),
    });

    const second = await request(`/admin/lostfound/${item.LostItemID}/claim`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adminNotes: 'Claimed twice' }),
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.claimedStatus, true);
    assert.equal(second.body.claimedStatus, true);
    assert.equal(first.body.adminNotes, 'Claimed once');
    assert.equal(second.body.adminNotes, 'Claimed twice');
  });

  test('endpoint de archive do admin guarda notas de administração', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const accessToken = createAccessToken(registeredByUserId, 'admin');

    const item = await createLostFoundItem();

    const response = await request(`/admin/lostfound/${item.LostItemID}/archive`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adminNotes: 'Archived by integration test' }),
    });

    assert.equal(response.status, 200);

    const updated = await prisma.lostAndFoundItem.findUnique({
      where: { LostItemID: item.LostItemID },
    });

    assert.equal(updated.IsArchived, true);
    assert.equal(updated.AdminNotes, 'Archived by integration test');
    assert.ok(updated.ArchivedAt instanceof Date);
  });

  test('listagem de admin devolve itens arquivados e notas de admin', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const accessToken = createAccessToken(registeredByUserId, 'admin');

    const active = await createLostFoundItem({
      AdminNotes: 'Visible only to admin',
      IsArchived: false,
    });
    const archived = await createLostFoundItem({
      AdminNotes: 'Archived internal note',
      IsArchived: true,
      ArchivedAt: new Date(),
    });

    const response = await request('/admin/lostfound', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body));

    const activeItem = response.body.find((item) => item.id === active.LostItemID);
    const archivedItem = response.body.find((item) => item.id === archived.LostItemID);

    assert.ok(activeItem);
    assert.ok(archivedItem);
    assert.equal(activeItem.adminNotes, 'Visible only to admin');
    assert.equal(archivedItem.adminNotes, 'Archived internal note');
    assert.equal(archivedItem.isArchived, true);
  });

  // Segurança de resposta pública
  test('respostas públicas nunca expõem notas de administração', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const item = await createLostFoundItem({
      AdminNotes: 'Internal only',
      IsArchived: false,
    });

    const listResponse = await request('/lostfound');
    const detailResponse = await request(`/lostfound/${item.LostItemID}`);

    assert.equal(listResponse.status, 200);
    assert.equal(detailResponse.status, 200);

    const listedItem = listResponse.body.find((entry) => entry.id === item.LostItemID);

    assert.ok(listedItem);
    assert.equal(Object.hasOwn(listedItem, 'adminNotes'), false);
    assert.equal(Object.hasOwn(detailResponse.body, 'adminNotes'), false);
  });

  test('pedido de admin por id devolve 404 para item inexistente', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const accessToken = createAccessToken(registeredByUserId, 'admin');

    const response = await request('/admin/lostfound/999999999', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    assert.equal(response.status, 404);
  });

  test('endpoints de admin rejeitam autenticação em falta e não admin', async (t) => {
    if (!registeredByUserId) {
      t.skip('Não existe utilizador ativo para registar item de perdidos e achados');
      return;
    }

    const noSessionResponse = await request('/admin/lostfound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'No Auth Item',
        foundDate: new Date().toISOString(),
      }),
    });

    assert.equal(noSessionResponse.status, 401);

    const studentAccessToken = createAccessToken(registeredByUserId, 'student');

    const nonAdminResponse = await request('/admin/lostfound', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Student Auth Item',
        foundDate: new Date().toISOString(),
      }),
    });

    assert.equal(nonAdminResponse.status, 403);
  });
}
