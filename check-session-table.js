import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSessionTable() {
  try {
    // Try to query the session table
    const result = await prisma.$queryRaw`SELECT 1 FROM session LIMIT 1`;
    console.log('Session table exists');
  } catch (error) {
    console.log('Session table does not exist:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkSessionTable();