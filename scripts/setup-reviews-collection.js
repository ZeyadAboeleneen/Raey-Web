import { MongoClient } from "mongodb"

const uri = process.env.MONGODB_URI
const client = new MongoClient(uri)

async function setupReviewsCollection() {
  try {
    console.log("🔄 Setting up reviews collection...")

    await client.connect()
    const db = client.db("alanod_fragrances")

    // Create reviews collection with indexes
    const reviewsCollection = db.collection("reviews")

    // Create indexes for better performance
    await reviewsCollection.createIndex({ productId: 1 })
    await reviewsCollection.createIndex({ userId: 1 })
    await reviewsCollection.createIndex({ createdAt: -1 })
    await reviewsCollection.createIndex({ productId: 1, userId: 1, orderId: 1 }, { unique: true })

    console.log("✅ Reviews collection setup complete")

    // Add some sample reviews for testing
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
    ]

    await reviewsCollection.insertMany(sampleReviews)
    console.log("✅ Sample reviews added")

    // Update product ratings based on reviews
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
  } catch (error) {
    console.error("❌ Error setting up reviews collection:", error)
  } finally {
    await client.close()
  }
}

setupReviewsCollection()
