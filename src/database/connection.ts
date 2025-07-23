import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

let prisma: PrismaClient;

export async function setupDatabase(): Promise<void> {
  try {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
    });

    // Test the connection
    await prisma.$connect();
    logger.info('✅ Database connection established');

    // Run any pending migrations
    // Note: In production, you should run migrations separately
    // await prisma.$executeRaw`PRAGMA journal_mode=WAL;`;
    
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

export { prisma };

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma?.$disconnect();
});

process.on('SIGINT', async () => {
  await prisma?.$disconnect();
});

process.on('SIGTERM', async () => {
  await prisma?.$disconnect();
});
