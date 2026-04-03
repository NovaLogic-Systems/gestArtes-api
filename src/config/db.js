const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
};

let pool = null;
const maxRetries = 5;
const initialDelay = 1000;

// Helper function with exponential backoff retry
async function connectWithRetry(attempt = 1) {
  try {
    console.log(`[DB] Attempting connection (attempt ${attempt}/${maxRetries})...`);
    const newPool = new sql.ConnectionPool(config);
    await newPool.connect();
    console.log('[DB] SQL Server connected successfully');
    return newPool;
  } catch (err) {
    if (attempt < maxRetries) {
      const delay = initialDelay * Math.pow(2, attempt - 1);
      console.warn(`[DB] Connection failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`, err.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      return connectWithRetry(attempt + 1);
    } else {
      console.error('[DB] All connection attempts failed. Shutting down.', err.message);
      process.exit(1);
    }
  }
}

// Initialize pool on startup
const poolPromise = connectWithRetry();

// Health check and auto-reconnect
async function ensurePoolConnected() {
  try {
    if (!pool) {
      pool = await poolPromise;
    }
    // Test the connection
    await pool.request().query('SELECT 1 as health');
    return pool;
  } catch (err) {
    console.warn('[DB] Health check failed. Attempting to reconnect...', err.message);
    pool = null;
    try {
      pool = await connectWithRetry();
      return pool;
    } catch (reconnectErr) {
      throw new Error(`Failed to reconnect to database: ${reconnectErr.message}`);
    }
  }
}

// Execute parameterized query to prevent SQL injection
async function query(sqlText, params = {}) {
  const activePool = await ensurePoolConnected();
  const request = activePool.request();

  // Bind parameters safely
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }

  return request.query(sqlText);
}

module.exports = { sql, poolPromise, query, ensurePoolConnected };
