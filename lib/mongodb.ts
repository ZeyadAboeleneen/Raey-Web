import { MongoClient, type Db } from "mongodb"

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"')
}

const uri = process.env.MONGODB_URI

// Windows-specific options for local development
const isWindows = process.platform === 'win32'
const isDevelopment = process.env.NODE_ENV === 'development'

const options = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  // Force IPv4 on Windows networks that have broken IPv6/DNS64
  family: 4 as 0 | 4 | 6,
} as const

let client: MongoClient
let clientPromise: Promise<MongoClient>

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    console.log("🔄 [MongoDB] Creating new client connection...")
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  console.log("🔄 [MongoDB] Creating production client connection...")
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export default clientPromise

// Ensure indexes are created once per process to keep queries fast
let indexesCreated = false
async function ensureIndexes(db: Db) {
  if (indexesCreated) return
  try {
    await db.collection('products').createIndexes([
      { key: { id: 1 }, name: 'idx_products_id', unique: true },
      { key: { isActive: 1, category: 1, createdAt: -1 }, name: 'idx_products_active_category_createdAt' },
      { key: { isActive: 1, createdAt: -1 }, name: 'idx_products_active_createdAt' },
      { key: { isActive: 1, isGiftPackage: 1, createdAt: -1 }, name: 'idx_products_active_gift_createdAt' },
      { key: { createdAt: -1 }, name: 'idx_products_createdAt' },
    ])
  } catch (err) {
    console.warn("⚠️ [MongoDB] Index creation skipped/failed:", err)
  } finally {
    indexesCreated = true
  }
}

export async function getDatabase(): Promise<Db> {
  try {
    const client = await clientPromise
    const dbName = process.env.MONGODB_DB || process.env.MONGODB_DB_NAME || "sense_fragrances"
    const db = client.db(dbName)
    // Create indexes (no-op after the first time in this process)
    await ensureIndexes(db)
    return db
  } catch (error) {
    console.error("❌ [MongoDB] Database connection failed:", error)
    throw error
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    console.log("🧪 [MongoDB] Testing database connection...")
    const db = await getDatabase()

    // Test basic operations
    const collections = await db.listCollections().toArray()
    console.log(
      "📋 [MongoDB] Available collections:",
      collections.map((c) => c.name),
    )

    // Test product query
    const productCount = await db.collection("products").countDocuments()
    console.log("🧴 [MongoDB] Products in database:", productCount)

    // Test order query
    const orderCount = await db.collection("orders").countDocuments()
    console.log("📦 [MongoDB] Orders in database:", orderCount)

    console.log("✅ [MongoDB] Connection test successful")
    return true
  } catch (error) {
    console.error("❌ [MongoDB] Connection test failed:", error)
    return false
  }
}

