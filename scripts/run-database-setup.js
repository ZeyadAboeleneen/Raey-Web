const { seedDatabase } = require("./seed-database")

async function runCompleteSetup() {
  console.log("🚀 Starting complete database setup...")
  console.log("=" * 50)

  try {
    // Step 1: Seed the database
    console.log("📝 Step 1: Seeding database...")
    await seedDatabase()
    console.log("✅ Database seeding completed")

    // Step 2: Verify setup
    console.log("\n📝 Step 2: Verifying setup...")
    const { MongoClient } = require("mongodb")
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017"
    const client = new MongoClient(uri)

    await client.connect()
    const db = client.db("alanod_fragrances")

    // Check collections
    const collections = await db.listCollections().toArray()
    console.log("📋 Collections created:", collections.map((c) => c.name).join(", "))

    // Check data counts
    const productCount = await db.collection("products").countDocuments()
    const userCount = await db.collection("users").countDocuments()
    const orderCount = await db.collection("orders").countDocuments()

    console.log("📊 Data verification:")
    console.log(`   Products: ${productCount}`)
    console.log(`   Users: ${userCount}`)
    console.log(`   Orders: ${orderCount}`)

    // Test queries
    console.log("\n🧪 Testing queries...")
    const activeProducts = await db.collection("products").find({ isActive: true }).toArray()
    console.log(`✅ Active products query: ${activeProducts.length} results`)

    const menProducts = await db.collection("products").find({ category: "men", isActive: true }).toArray()
    console.log(`✅ Men's products query: ${menProducts.length} results`)

    const womenProducts = await db.collection("products").find({ category: "women", isActive: true }).toArray()
    console.log(`✅ Women's products query: ${womenProducts.length} results`)

    await client.close()

    console.log("\n🎉 Database setup completed successfully!")
    console.log("🔗 You can now:")
    console.log("   1. Start your Next.js application")
    console.log("   2. Visit /debug to run additional tests")
    console.log("   3. Login with admin@sensefragrances.com / admin123")
    console.log("   4. Add new products via the admin dashboard")
  } catch (error) {
    console.error("❌ Database setup failed:", error)
    console.error("🔍 Error details:", error.message)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  runCompleteSetup()
}

module.exports = { runCompleteSetup }
