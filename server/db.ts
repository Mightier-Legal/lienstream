import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon for better connection handling in production
// These settings help handle Neon serverless cold starts
neonConfig.webSocketConstructor = ws;
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineConnect = false;
neonConfig.pipelineTLS = false;
neonConfig.wsProxy = (host) => host; // Direct connection without proxy

// Increase fetch timeout for cold starts (default is 10s, we need more for Neon)
neonConfig.fetchConnectionCache = true;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detect if running in production (deployed) environment
const isProduction = process.env.NODE_ENV === 'production' || 
                     process.env.REPL_SLUG !== undefined;

// Enhanced connection pool configuration with longer timeouts for production
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: isProduction ? 5 : 10, // Fewer connections in production to avoid exhaustion
  idleTimeoutMillis: isProduction ? 60000 : 30000, // 60s idle in production
  connectionTimeoutMillis: isProduction ? 30000 : 15000, // 30s timeout in production for cold starts
  maxUses: 7500, // Maximum uses per connection before replacing it
  allowExitOnIdle: false // Keep pool alive even when all connections are idle
});

// Add pool error handling with better logging
pool.on('error', (err) => {
  console.error('[Database Pool] Error:', err.message);
  // Don't crash the application on pool errors
});

pool.on('connect', () => {
  console.log('Database connection established');
});

// Helper function to test database connectivity
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error: any) {
    console.error('[Database] Connection test failed:', error.message);
    return false;
  }
}

export const db = drizzle({ client: pool, schema });