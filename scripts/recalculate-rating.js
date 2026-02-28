// Script to recalculate rating for a specific product
// Usage: node scripts/recalculate-rating.js <productId>

const productId = process.argv[2];

if (!productId) {
  console.log("Usage: node scripts/recalculate-rating.js <productId>");
  console.log("Example: node scripts/recalculate-rating.js product-1756511529343-hr57std8q");
  process.exit(1);
}

async function recalculateRating() {
  try {
    console.log(`🔄 Recalculating rating for product: ${productId}`);
    
    const response = await fetch('http://localhost:3000/api/reviews/recalculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ productId })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log("✅ Success:", result);
    } else {
      console.log("❌ Error:", result);
    }
  } catch (error) {
    console.error("❌ Failed to recalculate rating:", error.message);
  }
}

recalculateRating();
