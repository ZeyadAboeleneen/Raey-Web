import * as sql from "mssql";

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

const isBuild = process.env.NEXT_PHASE === "phase-production-build";

const config: sql.config = {
  server: process.env.MSSQL_SERVER || "",
  database: process.env.MSSQL_DATABASE || "",
  user: process.env.MSSQL_USER || "",
  password: process.env.MSSQL_PASSWORD || "",
  options: {
    encrypt: true,
    trustServerCertificate: true,
    // REVERTED (see below): useUTC:false looked correct for NEW writes (this
    // server runs in Africa/Cairo, and the ERP expects local wall-clock time),
    // but every row already in the database was written under the default
    // useUTC:true behavior — dates stored UTC-shifted from Cairo local. With
    // useUTC:false, reading that pre-existing data reinterprets it as local
    // directly, shifting every historical date by hours and corrupting
    // availability/double-booking checks across the entire booking history.
    // Data safety for existing bookings matters more than BookingDate's
    // display accuracy for new ones, so this stays at the driver default
    // (useUTC:true) until there's a real plan for the read/write split
    // between legacy and new rows.
  },
  pool: {
    // Shared site4now SQL hosting caps concurrent connections and will reject
    // logins ("Login failed for user") once the cap is exceeded. Keep this low.
    max: isBuild ? 1 : 5,
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
