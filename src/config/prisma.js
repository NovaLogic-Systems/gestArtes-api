/**
 * @file src/config/prisma.js
 * @author NovaLogic System
 * @institution IPCA
 * @project GestArtes - Projeto 50+10 para Entartes
 */

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is required for Prisma');
}

function parseMssqlConnectionString(url) {
	const withoutProtocol = url.replace(/^sqlserver:\/\//, '');
	const parts = withoutProtocol.split(';').map((p) => p.trim()).filter(Boolean);
	const [hostPart, ...kvParts] = parts;
	const params = {};
	for (const part of kvParts) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1);
	}
	const [host, portStr] = hostPart.split(':');
	return {
		server: host,
		port: portStr ? Number(portStr) : undefined,
		database: params.database || params['initial catalog'],
		user: params.user || params.username || params.uid || params.userid,
		password: params.password || params.pwd,
		encrypt: (params.encrypt || 'true').toLowerCase() === 'true',
		trustServerCertificate: (params.trustservercertificate || 'false').toLowerCase() === 'true',
	};
}

const parsed = parseMssqlConnectionString(process.env.DATABASE_URL);

const mssqlConfig = {
	server: parsed.server,
	port: parsed.port,
	database: parsed.database,
	user: parsed.user,
	password: parsed.password,
	options: {
		encrypt: parsed.encrypt,
		trustServerCertificate: parsed.trustServerCertificate,
		enableArithAbort: true,
	},
	pool: {
		min: 2,
		max: 10,
		idleTimeoutMillis: 300_000,
		acquireTimeoutMillis: 30_000,
	},
	connectionTimeout: 30_000,
	requestTimeout: 30_000,
};

const adapter = new PrismaMssql(mssqlConfig, {
	onPoolError: (err) => {
		console.error('[prisma:mssql:pool]', err?.message || err);
	},
	onConnectionError: (err) => {
		console.error('[prisma:mssql:connection]', err?.message || err);
	},
});

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
