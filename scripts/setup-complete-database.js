import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const client = new MongoClient(uri)

async function setupCompleteDatabase() {
  try {
    console.log("🔄 Setting up complete database with all collections...")

    await client.connect()
    const db = client.db("alanod_fragrances")

    // 1. Setup Reviews Collection
    console.log("📝 Setting up reviews collection...")
    const reviewsCollection = db.collection("reviews")

    // Create indexes for reviews
    await reviewsCollection.createIndex({ productId: 1 })
    await reviewsCollection.createIndex({ userId: 1 })
    await reviewsCollection.createIndex({ createdAt: -1 })
    await reviewsCollection.createIndex({ productId: 1, userId: 1 }, { unique: true })

    // Add sample reviews
    const sampleReviews = [
      {
        productId: "midnight-elegance",
        userId: "sample-user-1",
        userName: "Sarah Johnson",
        rating: 5,
        comment:
          "Absolutely love this fragrance! The scent is sophisticated and long-lasting. Perfect for evening events.",
        orderId: "sample-order-1",
        createdAt: new Date("2025-01-15"),
      },
      {
        productId: "midnight-elegance",
        userId: "sample-user-2",
        userName: "Michael Chen",
        rating: 4,
        comment: "Great fragrance with excellent projection. The bottle design is also very elegant.",
        orderId: "sample-order-2",
        createdAt: new Date("2025-01-20"),
      },
      {
        productId: "royal-oud",
        userId: "sample-user-3",
        userName: "Emma Wilson",
        rating: 5,
        comment: "This is my signature scent now! The oud is perfectly balanced and not overwhelming.",
        orderId: "sample-order-3",
        createdAt: new Date("2025-01-25"),
      },
      {
        productId: "golden-amber",
        userId: "sample-user-4",
        userName: "David Rodriguez",
        rating: 4,
        comment: "Warm and inviting scent. Great for daily wear and gets compliments regularly.",
        orderId: "sample-order-4",
        createdAt: new Date("2025-01-30"),
      },
    ]

    // Clear existing reviews and insert new ones
    await reviewsCollection.deleteMany({})
    await reviewsCollection.insertMany(sampleReviews)
    console.log("✅ Sample reviews added")

    // 2. Setup Offers Collection
    console.log("🎁 Setting up offers collection...")
    const offersCollection = db.collection("offers")

    // Create indexes for offers
    await offersCollection.createIndex({ isActive: 1 })
    await offersCollection.createIndex({ expiresAt: 1 })
    await offersCollection.createIndex({ priority: -1 })
    await offersCollection.createIndex({ createdAt: -1 })

    // Add sample offers
    const sampleOffers = [
      {
        title: "🎉 Weekend Special Sale",
        description: "Get 25% off on all fragrances this weekend only!",
        discountCode: "WEEKEND25",
        isActive: true,
        priority: 1,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        title: "🌟 New Customer Welcome",
        description: "Welcome to Sense Fragrances! Enjoy 15% off your first purchase.",
        discountCode: "WELCOME15",
        isActive: true,
        priority: 2,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    // Clear existing offers and insert new ones
    await offersCollection.deleteMany({})
    await offersCollection.insertMany(sampleOffers)
    console.log("✅ Sample offers added")

    // 3. Setup Discount Codes Collection
    console.log("💰 Setting up discount codes collection...")
    const discountCollection = db.collection("discount")

    // Create indexes for discount codes
    await discountCollection.createIndex({ code: 1 }, { unique: true })
    await discountCollection.createIndex({ isActive: 1 })
    await discountCollection.createIndex({ expiresAt: 1 })

    // Add sample discount codes
    const sampleDiscountCodes = [
      {
        code: "WEEKEND25",
        type: "percentage",
        value: 25,
        minOrderAmount: 500,
        maxUses: 100,
        currentUses: 0,
        isActive: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
      {
        code: "WELCOME15",
        type: "percentage",
        value: 15,
        minOrderAmount: 300,
        maxUses: 500,
        currentUses: 0,
        isActive: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
      {
        code: "SAVE100",
        type: "fixed",
        value: 100,
        minOrderAmount: 1000,
        maxUses: 50,
        currentUses: 0,
        isActive: true,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      },
    ]

    // Clear existing discount codes and insert new ones
    await discountCollection.deleteMany({})
    await discountCollection.insertMany(sampleDiscountCodes)
    console.log("✅ Sample discount codes added")

    // 4. Update Product Ratings
    console.log("⭐ Updating product ratings based on reviews...")
    const products = await db.collection("products").find({}).toArray()

    for (const product of products) {
      // Get reviews where productId matches the product ID
      const directReviews = await reviewsCollection.find({ productId: product.id }).toArray()
      
      // Get reviews where originalProductId matches the product ID (for customized gift products)
      const originalProductIdReviews = await reviewsCollection
        .find({ originalProductId: { $regex: new RegExp(`^${product.id}`, 'i') } })
        .toArray()
      
      // Combine both sets of reviews and remove duplicates based on _id
      const allReviews = [...directReviews, ...originalProductIdReviews]
      const uniqueReviews = allReviews.filter((review, index, self) => 
        index === self.findIndex(r => r._id.toString() === review._id.toString())
      )
      
      if (uniqueReviews.length > 0) {
        const averageRating = uniqueReviews.reduce((sum, review) => sum + review.rating, 0) / uniqueReviews.length
        await db.collection("products").updateOne(
          { id: product.id },
          {
            $set: {
              rating: Math.round(averageRating * 10) / 10,
              reviews: uniqueReviews.length,
            },
          },
        )
      }
    }

    console.log("✅ Product ratings updated")

    // 5. Create sample users for testing
    console.log("👥 Setting up sample users...")
    const usersCollection = db.collection("users")

    const sampleUsers = [
      {
        name: "John Doe",
        email: "john.doe@example.com",
        password: "$2b$10$example", // In real app, this would be properly hashed
        role: "user",
        createdAt: new Date(),
      },
      {
        name: "Jane Smith",
        email: "jane.smith@example.com",
        password: "$2b$10$example",
        role: "user",
        createdAt: new Date(),
      },
    ]

    // Only add sample users if they don't exist
    for (const user of sampleUsers) {
      const existingUser = await usersCollection.findOne({ email: user.email })
      if (!existingUser) {
        await usersCollection.insertOne(user)
      }
    }

    console.log("✅ Sample users setup complete")

    console.log("\n🎉 Database setup completed successfully!")
    console.log("\n📊 Summary:")
    console.log(`- Reviews: ${await reviewsCollection.countDocuments()} documents`)
    console.log(`- Offers: ${await offersCollection.countDocuments()} documents`)
    console.log(`- Discount Codes: ${await discountCollection.countDocuments()} documents`)
    console.log(`- Products: ${await db.collection("products").countDocuments()} documents`)
    console.log(`- Users: ${await usersCollection.countDocuments()} documents`)
  } catch (error) {
    console.error("❌ Error setting up database:", error)
  } finally {
    await client.close()
  }
}

setupCompleteDatabase()
