const { PrismaClient } = require('@prisma/client');

async function verifySessionTable() {
  const prisma = new PrismaClient({
    log: ['query', 'error', 'warn'],
  });

  try {
    console.log('🔍 Checking database connection...');
    
    // Test basic connection
    await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful');

    // Check if Session table exists
    console.log('\n🔍 Checking Session table...');
    const result = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'session'
      );
    `;
    console.log('Session table exists:', result);

    // Try to query the Session table
    console.log('\n🔍 Querying Session table...');
    const sessions = await prisma.session.findMany({
      take: 1,
    });
    console.log('✅ Session table is accessible');
    console.log('Sample sessions count:', sessions.length);

    // Check table structure
    console.log('\n🔍 Checking Session table structure...');
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'session'
      ORDER BY ordinal_position;
    `;
    console.log('Session table columns:', columns);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifySessionTable();
