const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/alanod";

async function addOutOfStockToFavorites() {
  console.log("🔧 Adding out-of-stock product to favorites...");
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    
    const db = client.db();
    
    // Find the user (using the test user)
    const user = await db.collection("users").findOne({ email: "user@example.com" });
    
    if (!user) {
      console.log("❌ Test user not found");
      return;
    }
    
    console.log("👤 Found user:", user.email);
    
    // Add the out-of-stock product to favorites
    const favorite = {
      userId: user._id,
      productId: "vintage-amber-1",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Check if already in favorites
    const existing = await db.collection("favorites").findOne({
      userId: user._id,
      productId: "vintage-amber-1"
    });
    
    if (existing) {
      console.log("ℹ️ Product already in favorites");
    } else {
      await db.collection("favorites").insertOne(favorite);
      console.log("✅ Added Vintage Amber to favorites");
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("🔌 Database connection closed");
  }
}

addOutOfStockToFavorites();
