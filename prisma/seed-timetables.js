require('dotenv/config')

const fs = require('node:fs')
const path = require('node:path')
const sql = require('mssql')

function parseMssqlConnectionString(url) {
  const withoutProtocol = String(url || '').replace(/^sqlserver:\/\//, '')
  const parts = withoutProtocol.split(';').map((part) => part.trim()).filter(Boolean)
  const [hostPart, ...kvParts] = parts
  const params = {}

  for (const part of kvParts) {
    const eqIndex = part.indexOf('=')
    if (eqIndex === -1) continue
    params[part.slice(0, eqIndex).trim().toLowerCase()] = part.slice(eqIndex + 1)
  }

  const [server, portStr] = String(hostPart || '').split(':')

  return {
    server,
    port: portStr ? Number(portStr) : 1433,
    database: params.database || params['initial catalog'],
    user: params.user || params.username || params.uid || params.userid,
    password: params.password || params.pwd,
    encrypt: String(params.encrypt || 'true').toLowerCase() === 'true',
    trustServerCertificate: String(params.trustservercertificate || 'false').toLowerCase() === 'true',
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run the timetable seed')
  }

  const seedFilePath = path.join(__dirname, 'sql', '20260528_seed_timetables.sql')

  if (!fs.existsSync(seedFilePath)) {
    throw new Error(`Seed file not found: ${seedFilePath}`)
  }

  const connection = parseMssqlConnectionString(databaseUrl)
  const seedSql = fs.readFileSync(seedFilePath, 'utf8')

  const pool = await sql.connect({
    server: connection.server,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    options: {
      encrypt: connection.encrypt,
      trustServerCertificate: connection.trustServerCertificate,
      enableArithAbort: true,
    },
    pool: {
      min: 0,
      max: 5,
      idleTimeoutMillis: 300000,
    },
    connectionTimeout: 30000,
    requestTimeout: 300000,
  })

  try {
    await pool.request().batch(seedSql)
    console.log(`Timetable seed applied successfully from ${path.basename(seedFilePath)}`)
  } finally {
    await pool.close()
  }
}

main().catch((error) => {
  console.error('[seed:timetables]', error?.message || error)
  process.exit(1)
})
