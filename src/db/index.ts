import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const connectionString = process.env.DATABASE_URL || 'postgresql://ocr_user:ocr_password@localhost:5432/ocr_test_db';

// Create postgres connection
const client = postgres(connectionString);

// Create drizzle db instance
export const db = drizzle(client, { schema });

export * from './schema.js';
