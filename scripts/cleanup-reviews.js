// Script to clean up duplicate reviews
const { MongoClient } = require('mongodb');

async function cleanupReviews() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    // Find all reviews grouped by productId and userId
    const pipeline = [
      {
        $group: {
          _id: { productId: "$productId", userId: "$userId" },
          reviews: { $push: "$$ROOT" },
          count: { $sum: 1 }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ];
    
    const duplicates = await db.collection("reviews").aggregate(pipeline).toArray();
    
    console.log(`Found ${duplicates.length} sets of duplicate reviews`);
    
    for (const duplicate of duplicates) {
      // Sort by createdAt, keep the newest one
      duplicate.reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      // Remove all except the first (newest) one
      const toRemove = duplicate.reviews.slice(1);
      
      for (const review of toRemove) {
        await db.collection("reviews").deleteOne({ _id: review._id });
        console.log(`Removed duplicate review: ${review._id} for product ${duplicate._id.productId} by user ${duplicate._id.userId}`);
      }
    }
    
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    await client.close();
  }
}

cleanupReviews();
