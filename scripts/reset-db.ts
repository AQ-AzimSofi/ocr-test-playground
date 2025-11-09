import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const sql = postgres(
  process.env.DATABASE_URL ||
    'postgresql://ocr_user:ocr_password@localhost:5432/ocr_test_db'
);

try {
  // Drop both public and drizzle schemas to ensure clean state
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  console.log('Public schema dropped');

  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  console.log('Drizzle schema dropped');

  await sql`CREATE SCHEMA public`;
  console.log('Public schema recreated');

  console.log(
    '\nDatabase reset successfully. Run "npm run db:migrate" or "npm run db:push" to apply schema.'
  );
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await sql.end();
}
