import sql from "mssql";

/**
 * MSSQL connection pool — singleton across hot reloads.
 *
 * Uses individual env vars so the configuration is explicit and easy to
 * debug.  The pool is created lazily on first call to `getMssqlPool()`.
 */

const globalForMssql = globalThis as typeof globalThis & {
  _mssqlPool?: sql.ConnectionPool;
  _mssqlConnecting?: Promise<sql.ConnectionPool>;
};

const config: sql.config = {
  server: process.env.MSSQL_SERVER || "",
  database: process.env.MSSQL_DATABASE || "",
  user: process.env.MSSQL_USER || "",
  password: process.env.MSSQL_PASSWORD || "",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
  requestTimeout: 30_000,
  connectionTimeout: 15_000,
};

/**
 * Returns a connected MSSQL connection pool.
 * Safe to call repeatedly — it reuses the same pool.
 */
export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  // Already connected
  if (globalForMssql._mssqlPool?.connected) {
    return globalForMssql._mssqlPool;
  }

  // Connection in progress — wait for it
  if (globalForMssql._mssqlConnecting) {
    return globalForMssql._mssqlConnecting;
  }

  // Create new connection
  const connectPromise = new sql.ConnectionPool(config)
    .connect()
    .then((pool) => {
      console.log("✅ [MSSQL] Connected to ERP database");
      globalForMssql._mssqlPool = pool;
      globalForMssql._mssqlConnecting = undefined;

      pool.on("error", (err) => {
        console.error("❌ [MSSQL] Pool error:", err.message);
        globalForMssql._mssqlPool = undefined;
      });

      return pool;
    })
    .catch((err) => {
      console.error("❌ [MSSQL] Connection failed:", err.message);
      globalForMssql._mssqlConnecting = undefined;
      throw err;
    });

  globalForMssql._mssqlConnecting = connectPromise;
  return connectPromise;
}

export { sql };
