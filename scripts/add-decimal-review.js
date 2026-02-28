// MongoDB Compass Decimal Review Helper
// Use this script as a reference for adding decimal reviews in MongoDB Compass

/*
HOW TO ADD DECIMAL REVIEWS IN MONGODB COMPASS:

1. Open MongoDB Compass and connect to your database
2. Navigate to the "reviews" collection
3. Click "Insert Document" 
4. Use the following structure:

{
  "productId": "your-product-id",
  "originalProductId": "your-product-id",  // optional
  "userId": "user-id-or-email",
  "userName": "User Name",
  "rating": 4.7,  // DECIMAL RATING - this can be any number between 1.0 and 5.0
  "comment": "Great product with minor improvements needed!",
  "orderId": "order-id",
  "createdAt": new Date(),
  "updatedAt": new Date()
}

DECIMAL RATING EXAMPLES:
- 1.0, 1.5, 1.8, 2.3, 2.7, 3.0, 3.5, 3.9, 4.2, 4.6, 5.0

VALIDATION:
- Rating must be between 1.0 and 5.0 (decimals allowed)
- The system will automatically calculate average ratings for products
- Star display will show partial stars for decimal values

AFTER ADDING REVIEWS:
The system will automatically:
1. Calculate new average rating for the product
2. Update the product's rating field with decimal precision
3. Display partial stars in the UI
*/

console.log("Use this file as a reference for adding decimal reviews in MongoDB Compass");
console.log("See the comments above for detailed instructions");
