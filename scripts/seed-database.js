const { MongoClient } = require("mongodb")
const bcrypt = require("bcryptjs")

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017"
const dbName = "alanod_fragrances"

async function seedDatabase() {
  const client = new MongoClient(uri)

  try {
    console.log("🔄 Connecting to MongoDB...")
    await client.connect()
    console.log("✅ Connected to MongoDB successfully")

    const db = client.db(dbName)

    // Test database connection
    const adminDb = client.db().admin()
    const status = await adminDb.ping()
    console.log("📊 Database ping status:", status)

    // Clear existing data
    console.log("🧹 Clearing existing collections...")
    await db.collection("users").deleteMany({})
    await db.collection("products").deleteMany({})
    await db.collection("orders").deleteMany({})
    console.log("✅ Collections cleared")

    // Create indexes for better performance
    console.log("📝 Creating database indexes...")
    await db.collection("products").createIndex({ id: 1, category: 1 })
    await db.collection("products").createIndex({ isActive: 1 })
    await db.collection("orders").createIndex({ userId: 1 })
    await db.collection("orders").createIndex({ id: 1 })
    await db.collection("users").createIndex({ email: 1 }, { unique: true })
    console.log("✅ Indexes created")

    // Seed users
    console.log("👥 Seeding users...")
    const hashedAdminPassword = await bcrypt.hash("admin123", 12)
    const hashedUserPassword = await bcrypt.hash("user123", 12)

    const users = [
      {
        email: "admin@sensefragrances.com",
        password: hashedAdminPassword,
        name: "Admin User",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: "user@example.com",
        password: hashedUserPassword,
        name: "John Doe",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const userResult = await db.collection("users").insertMany(users)
    console.log(`✅ ${userResult.insertedCount} users seeded successfully`)

    // Seed products with comprehensive data
    console.log("🧴 Seeding products...")
    const products = [
      {
        id: "midnight-essence",
        name: "Midnight Essence",
        description: "A bold and mysterious fragrance with notes of bergamot, cedar, and amber",
        longDescription:
          "Midnight Essence captures the allure of the night with its sophisticated blend of citrus freshness and woody depth. This captivating fragrance opens with bright bergamot and black pepper, evolving into a heart of cedar and lavender, before settling into a rich base of amber, vanilla, and musk. Perfect for the modern gentleman who commands attention.",
        price: 120,
        sizes: [
          { size: "Travel", volume: "15ml", price: 45 },
          { size: "Standard", volume: "50ml", price: 120 },
          { size: "Large", volume: "100ml", price: 180 },
        ],
        images: [
          "/placeholder.svg",
          "/placeholder.svg",
          "/placeholder.svg",
        ],
        rating: 4.8,
        reviews: 127,
        notes: {
          top: ["Bergamot", "Black Pepper", "Lemon"],
          middle: ["Cedar", "Lavender", "Geranium"],
          base: ["Amber", "Vanilla", "Musk"],
        },
        category: "men",
        isBestseller: true,
        isNew: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "rose-noir",
        name: "Rose Noir",
        description: "Elegant and romantic with dark rose, patchouli, and vanilla",
        longDescription:
          "Rose Noir is an intoxicating blend that celebrates the darker side of femininity. This sophisticated fragrance combines the classic elegance of rose with mysterious undertones of patchouli and warm vanilla. The result is a scent that is both romantic and rebellious, perfect for the woman who embraces her complexity.",
        price: 130,
        sizes: [
          { size: "Travel", volume: "15ml", price: 50 },
          { size: "Standard", volume: "50ml", price: 130 },
          { size: "Large", volume: "100ml", price: 195 },
        ],
        images: [
          "/placeholder.svg",
          "/placeholder.svg",
          "/placeholder.svg",
        ],
        rating: 4.9,
        reviews: 203,
        notes: {
          top: ["Bulgarian Rose", "Pink Pepper", "Bergamot"],
          middle: ["Dark Rose", "Patchouli", "Jasmine"],
          base: ["Vanilla", "Sandalwood", "Amber"],
        },
        category: "women",
        isBestseller: true,
        isNew: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "urban-legend",
        name: "Urban Legend",
        description: "Modern and sophisticated with hints of leather, vanilla, and sandalwood",
        longDescription:
          "Urban Legend embodies the spirit of the modern city dweller. This contemporary fragrance blends urban sophistication with natural warmth, featuring top notes of fresh citrus, a heart of leather and spices, and a base of creamy vanilla and exotic sandalwood.",
        price: 95,
        sizes: [
          { size: "Travel", volume: "15ml", price: 35 },
          { size: "Standard", volume: "50ml", price: 95 },
          { size: "Large", volume: "100ml", price: 145 },
        ],
        images: ["/placeholder.svg", "/placeholder.svg"],
        rating: 4.6,
        reviews: 89,
        notes: {
          top: ["Bergamot", "Grapefruit", "Pink Pepper"],
          middle: ["Leather", "Cardamom", "Rose"],
          base: ["Vanilla", "Sandalwood", "Patchouli"],
        },
        category: "men",
        isBestseller: false,
        isNew: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "crystal-bloom",
        name: "Crystal Bloom",
        description: "Fresh and floral with peony, jasmine, and white musk",
        longDescription:
          "Crystal Bloom captures the essence of a blooming garden at dawn. This delicate yet captivating fragrance opens with sparkling citrus notes, blooms into a heart of fresh peony and jasmine, and settles into a soft base of white musk and clean woods.",
        price: 105,
        sizes: [
          { size: "Travel", volume: "15ml", price: 40 },
          { size: "Standard", volume: "50ml", price: 105 },
          { size: "Large", volume: "100ml", price: 160 },
        ],
        images: ["/placeholder.svg", "/placeholder.svg"],
        rating: 4.7,
        reviews: 156,
        notes: {
          top: ["Lemon", "Green Apple", "Water Lily"],
          middle: ["Peony", "Jasmine", "Freesia"],
          base: ["White Musk", "Cedar", "Amber"],
        },
        category: "women",
        isBestseller: false,
        isNew: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "signature-duo",
        name: "Signature Duo",
        description: "Perfect pair featuring our bestselling fragrances in travel sizes",
        longDescription:
          "The Signature Duo brings together our two most beloved fragrances in elegant travel sizes. This carefully curated set includes both Midnight Essence and Rose Noir, allowing you to experience the full range of our artistry. Presented in a luxurious gift box, it's perfect for gifting or treating yourself to variety.",
        price: 180,
        sizes: [{ size: "Duo Set", volume: "2x15ml", price: 180 }],
        images: ["/placeholder.svg", "/placeholder.svg"],
        rating: 4.9,
        reviews: 89,
        notes: {
          top: ["Bergamot", "Bulgarian Rose", "Black Pepper"],
          middle: ["Cedar", "Dark Rose", "Patchouli"],
          base: ["Amber", "Vanilla", "Sandalwood"],
        },
        category: "packages",
        isBestseller: true,
        isNew: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const productResult = await db.collection("products").insertMany(products)
    console.log(`✅ ${productResult.insertedCount} products seeded successfully`)

    // Verify data insertion
    console.log("🔍 Verifying data insertion...")
    const userCount = await db.collection("users").countDocuments()
    const productCount = await db.collection("products").countDocuments()
    const activeProductCount = await db.collection("products").countDocuments({ isActive: true })

    console.log(`📊 Database Statistics:`)
    console.log(`   Users: ${userCount}`)
    console.log(`   Products: ${productCount}`)
    console.log(`   Active Products: ${activeProductCount}`)

    // Test product queries
    console.log("🧪 Testing product queries...")
    const menProducts = await db.collection("products").find({ category: "men", isActive: true }).toArray()
    const womenProducts = await db.collection("products").find({ category: "women", isActive: true }).toArray()
    const packageProducts = await db.collection("products").find({ category: "packages", isActive: true }).toArray()

    console.log(`   Men's products: ${menProducts.length}`)
    console.log(`   Women's products: ${womenProducts.length}`)
    console.log(`   Package products: ${packageProducts.length}`)

    console.log("🎉 Database seeded successfully!")
    console.log("🔗 Connection string used:", uri.replace(/\/\/.*@/, "//***:***@"))
  } catch (error) {
    console.error("❌ Error seeding database:", error)
    console.error("Stack trace:", error.stack)
    process.exit(1)
  } finally {
    await client.close()
    console.log("🔌 Database connection closed")
  }
}

// Run the seeding function
if (require.main === module) {
  seedDatabase()
}

module.exports = { seedDatabase }
