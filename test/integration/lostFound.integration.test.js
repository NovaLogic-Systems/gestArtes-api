const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('dotenv').config();

const missingEnv = ['DATABASE_URL'].filter((key) => !process.env[key]);
const shouldRun = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

if (!shouldRun) {
  test('Lost & Found integration tests are skipped unless RUN_DB_INTEGRATION_TESTS=true', { skip: true }, () => {});
} else if (missingEnv.length > 0) {
  test(`Lost & Found integration tests are skipped due to missing env vars: ${missingEnv.join(', ')}`, { skip: true }, () => {});
} else {
  const signature = require('cookie-signature');
  const app = require('../../src/app');
  const prisma = require('../../src/config/prisma');

  const createdItemIds = [];
  const createdSessionIds = [];

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

  function hasSessionSecret() {
    return Boolean(process.env.SESSION_SECRET);
  }

  async function createSessionCookie(userId, role) {
    if (!hasSessionSecret()) {
      return null;
    }

    const sid = crypto.randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000);
    const session = {
      cookie: {
        originalMaxAge: 60 * 60 * 1000,
        expires: expires.toISOString(),
        httpOnly: true,
        path: '/',
        secure: false,
        sameSite: 'lax',
      },
      userId,
      role,
      user: {
        userId,
        role,
      },
    };

    await prisma.$executeRaw`
      INSERT INTO [dbo].[Sessions] ([sid], [session], [expires])
      VALUES (${sid}, ${JSON.stringify(session)}, ${expires})
    `;

    createdSessionIds.push(sid);

    const signedSid = `s:${signature.sign(sid, process.env.SESSION_SECRET)}`;
    return `connect.sid=${encodeURIComponent(signedSid)}`;
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

    if (createdSessionIds.length > 0) {
      for (const sid of createdSessionIds) {
        await prisma.$executeRaw`
          DELETE FROM [dbo].[Sessions]
          WHERE [sid] = ${sid}
        `;
      }
    }

    await prisma.$disconnect();
  });

  test('public listing excludes archived items', async (t) => {
    if (!registeredByUserId) {
      t.skip('No active user available to register lost and found item');
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

  test('public get by id returns 404 for archived item', async (t) => {
    if (!registeredByUserId) {
      t.skip('No active user available to register lost and found item');
      return;
    }

    const archived = await createLostFoundItem({
      IsArchived: true,
      ArchivedAt: new Date(),
    });

    const response = await request(`/lostfound/${archived.LostItemID}`);

    assert.equal(response.status, 404);
  });

  test('admin claim endpoint is idempotent', async (t) => {
    if (!registeredByUserId) {
      t.skip('No active user available to register lost and found item');
      return;
    }

    const cookie = await createSessionCookie(registeredByUserId, 'admin');
    if (!cookie) {
      t.skip('SESSION_SECRET is required to create signed test session cookies');
      return;
    }

    const item = await createLostFoundItem({ ClaimedStatus: false });

    const first = await request(`/admin/lostfound/${item.LostItemID}/claim`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ adminNotes: 'Claimed once' }),
    });

    const second = await request(`/admin/lostfound/${item.LostItemID}/claim`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({ adminNotes: 'Claimed twice' }),
    });

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.claimedStatus, true);
    assert.equal(second.body.claimedStatus, true);
  });

  test('admin archive endpoint stores admin notes', async (t) => {
    if (!registeredByUserId) {
      t.skip('No active user available to register lost and found item');
      return;
    }

    const cookie = await createSessionCookie(registeredByUserId, 'admin');
    if (!cookie) {
      t.skip('SESSION_SECRET is required to create signed test session cookies');
      return;
    }

    const item = await createLostFoundItem();

    const response = await request(`/admin/lostfound/${item.LostItemID}/archive`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
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

  test('admin endpoints reject missing and non-admin sessions', async (t) => {
    if (!registeredByUserId) {
      t.skip('No active user available to register lost and found item');
      return;
    }

    const noSessionResponse = await request('/admin/lostfound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'No Session Item',
        foundDate: new Date().toISOString(),
      }),
    });

    assert.equal(noSessionResponse.status, 401);

    const studentCookie = await createSessionCookie(registeredByUserId, 'student');
    if (!studentCookie) {
      t.skip('SESSION_SECRET is required to create signed test session cookies');
      return;
    }

    const nonAdminResponse = await request('/admin/lostfound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: studentCookie,
      },
      body: JSON.stringify({
        title: 'Student Session Item',
        foundDate: new Date().toISOString(),
      }),
    });

    assert.equal(nonAdminResponse.status, 403);
  });
}
