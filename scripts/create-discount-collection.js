const { MongoClient } = require("mongodb")

async function createDiscountCollection() {
  const client = new MongoClient(process.env.MONGODB_URI)

  try {
    await client.connect()
    console.log("🔄 [Database] Connected to MongoDB")

    const db = client.db("alanod_fragrances")

    // Create discount collection
    const discountCollection = db.collection("discount")

    // Create indexes for better performance
    await discountCollection.createIndex({ code: 1 }, { unique: false }) // Allow duplicates
    await discountCollection.createIndex({ isActive: 1 })
    await discountCollection.createIndex({ expiresAt: 1 })

    console.log("✅ [Database] Discount collection created successfully")

    // Insert sample discount codes
    const sampleDiscounts = [
      {
        code: "WELCOME10",
        type: "percentage",
        value: 10,
        minOrderAmount: 500,
        maxUses: 100,
        currentUses: 0,
        isActive: true,
        expiresAt: new Date("2025-12-31"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        code: "SAVE20",
        type: "percentage",
        value: 20,
        minOrderAmount: 1000,
        maxUses: 50,
        currentUses: 0,
        isActive: true,
        expiresAt: new Date("2025-12-31"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    await discountCollection.insertMany(sampleDiscounts)
    console.log("✅ [Database] Sample discount codes inserted")
  } catch (error) {
    console.error("❌ [Database] Error creating discount collection:", error)
  } finally {
    await client.close()
  }
}

createDiscountCollection()
