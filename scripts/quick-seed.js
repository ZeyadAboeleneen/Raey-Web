const { MongoClient } = require("mongodb")
const bcrypt = require("bcryptjs")

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/alanod-fragrances"

const sampleProducts = [
  {
    id: "midnight-essence-1",
    name: "Midnight Essence",
    description: "A captivating blend of mystery and elegance",
    longDescription:
      "Midnight Essence captures the allure of the night with its sophisticated blend of dark berries, smoky woods, and warm amber. This fragrance evolves beautifully on the skin, revealing different facets throughout the evening.",
    price: 2400, // EGP
    sizes: [
      { size: "Travel", volume: "15ml", price: 900 },
      { size: "Standard", volume: "50ml", price: 2400 },
      { size: "Large", volume: "100ml", price: 4200 },
    ],
    images: ["/placeholder.svg"],
    rating: 4.8,
    reviews: 127,
    notes: {
      top: ["Bergamot", "Black Currant", "Pink Pepper"],
      middle: ["Rose", "Jasmine", "Cedar"],
      base: ["Amber", "Musk", "Vanilla"],
    },
    category: "men",
    isNew: true,
    isBestseller: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "rose-noir-1",
    name: "Rose Noir",
    description: "Dark rose with mysterious undertones",
    longDescription:
      "Rose Noir is a sophisticated interpretation of the classic rose fragrance, enhanced with dark and mysterious notes that create an unforgettable olfactory experience.",
    price: 2600, // EGP
    sizes: [
      { size: "Travel", volume: "15ml", price: 950 },
      { size: "Standard", volume: "50ml", price: 2600 },
      { size: "Large", volume: "100ml", price: 4500 },
    ],
    images: ["/placeholder.svg"],
    rating: 4.6,
    reviews: 89,
    notes: {
      top: ["Bulgarian Rose", "Saffron", "Cardamom"],
      middle: ["Turkish Rose", "Oud", "Patchouli"],
      base: ["Sandalwood", "Amber", "White Musk"],
    },
    category: "women",
    isNew: false,
    isBestseller: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "ocean-breeze-1",
    name: "Ocean Breeze",
    description: "Fresh aquatic fragrance inspired by the sea",
    longDescription:
      "Ocean Breeze brings the refreshing essence of the Mediterranean coast with its clean, aquatic notes and subtle marine accords.",
    price: 2200, // EGP
    sizes: [
      { size: "Travel", volume: "15ml", price: 850 },
      { size: "Standard", volume: "50ml", price: 2200 },
      { size: "Large", volume: "100ml", price: 3800 },
    ],
    images: ["/placeholder.svg"],
    rating: 4.4,
    reviews: 156,
    notes: {
      top: ["Sea Salt", "Lemon", "Mint"],
      middle: ["Lavender", "Geranium", "Sage"],
      base: ["Driftwood", "Ambergris", "White Musk"],
    },
    category: "men",
    isNew: false,
    isBestseller: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "luxury-gift-set-1",
    name: "Luxury Gift Set",
    description: "Premium collection of our bestselling fragrances",
    longDescription:
      "Our Luxury Gift Set includes travel sizes of our three most popular fragrances, beautifully packaged in an elegant gift box.",
    price: 3500, // EGP
    sizes: [{ size: "Gift Set", volume: "3x15ml", price: 3500 }],
    images: ["/placeholder.svg"],
    rating: 4.9,
    reviews: 67,
    notes: {
      top: ["Mixed Collection"],
      middle: ["Mixed Collection"],
      base: ["Mixed Collection"],
    },
    category: "packages",
    isNew: true,
    isBestseller: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "vintage-amber-1",
    name: "Vintage Amber",
    description: "Rich amber fragrance - currently out of stock",
    longDescription:
      "Vintage Amber is a warm and luxurious fragrance that combines rich amber notes with precious woods and spices. Currently unavailable.",
    price: 2800, // EGP
    sizes: [
      { size: "Travel", volume: "15ml", price: 1000 },
      { size: "Standard", volume: "50ml", price: 2800 },
      { size: "Large", volume: "100ml", price: 4800 },
    ],
    images: ["/placeholder.svg"],
    rating: 4.8,
    reviews: 156,
    notes: {
      top: ["Amber", "Saffron"],
      middle: ["Sandalwood", "Vanilla"],
      base: ["Musk", "Patchouli"],
    },
    category: "women",
    isNew: false,
    isBestseller: true,
    isOutOfStock: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const sampleUsers = [
  {
    email: "admin@alanodfragrances.com",
    password: "admin123",
    name: "Admin User",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    email: "user@example.com",
    password: "user123",
    name: "Test User",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

async function seedDatabase() {
  console.log("🌱 Starting database seeding...")

  const client = new MongoClient(MONGODB_URI)

  try {
    await client.connect()
    console.log("✅ Connected to MongoDB")

    const db = client.db()

    // Clear existing data
    console.log("🧹 Clearing existing data...")
    await db.collection("users").deleteMany({})
    await db.collection("products").deleteMany({})
    await db.collection("orders").deleteMany({})

    // Insert products
    console.log("📦 Inserting products...")
    await db.collection("products").insertMany(sampleProducts)
    console.log(`✅ Inserted ${sampleProducts.length} products`)

    // Insert users with hashed passwords
    console.log("👥 Inserting users...")
    const usersWithHashedPasswords = await Promise.all(
      sampleUsers.map(async (user) => ({
        ...user,
        password: await bcrypt.hash(user.password, 10),
      })),
    )
    await db.collection("users").insertMany(usersWithHashedPasswords)
    console.log(`✅ Inserted ${sampleUsers.length} users`)

    console.log("🎉 Database seeding completed successfully!")
    console.log("\n📋 Login credentials:")
    console.log("Admin: admin@alanodfragrances.com / admin123")
    console.log("User: user@example.com / user123")
  } catch (error) {
    console.error("❌ Error seeding database:", error)
  } finally {
    await client.close()
    console.log("🔌 Database connection closed")
  }
}

seedDatabase()
