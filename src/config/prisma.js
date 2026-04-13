require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is required for Prisma');
}

const adapter = new PrismaMssql(process.env.DATABASE_URL);

const prisma = new PrismaClient({ adapter });

module.exports = prisma;
