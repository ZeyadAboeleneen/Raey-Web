# API Routes Conversion Status - MongoDB to Supabase

## ✅ Fully Converted Routes

### Authentication Routes (100% Complete)
- ✅ `app/api/auth/login/route.ts`
- ✅ `app/api/auth/register/route.ts`
- ✅ `app/api/auth/me/route.ts`
- ✅ `app/api/auth/refresh/route.ts`
- ✅ `app/api/auth/forgot-password/route.ts`
- ✅ `app/api/auth/reset-password/route.ts`
- ✅ `app/api/auth/update-profile/route.ts`
- ✅ `app/api/auth/verify/route.ts`

### Products Routes (100% Complete)
- ✅ `app/api/products/route.ts` (GET, POST, PUT, DELETE)
- ✅ `app/api/products/[category]/[productId]/route.ts`

### Orders Routes (100% Complete)
- ✅ `app/api/orders/route.ts` (GET, POST)
- ✅ `app/api/orders/[orderId]/route.ts` (PATCH)
- ✅ `app/api/orders/update-status/route.ts` (PUT)

### Favorites Routes (100% Complete)
- ✅ `app/api/favorites/route.ts` (GET, POST, DELETE)

### Reviews Routes (Partial - 75% Complete)
- ✅ `app/api/reviews/route.ts` (GET, POST)
- ✅ `app/api/reviews/product/[id]/route.ts` (GET)
- ✅ `app/api/reviews/recalculate/route.ts` (POST)
- ⏳ `app/api/reviews/add/route.ts` (POST) - **Needs conversion** (complex route with order item updates)

---

## ⏳ Routes Still Needing Conversion

### Discount Codes Routes
- ⏳ `app/api/discount-codes/route.ts` (GET, POST)
- ⏳ `app/api/discount-codes/validate/route.ts` (POST)

### Offers Routes
- ⏳ `app/api/offers/route.ts` (GET, POST, PUT, DELETE)

### Contact Routes
- ⏳ `app/api/contact/route.ts` (POST)

### Admin Routes
- ⏳ `app/api/admin/orders/[orderId]/route.ts` (PATCH, PUT, DELETE)

### Email Routes (May not need database conversion)
These routes use nodemailer and may just need environment variable checks:
- ⏳ `app/api/send-welcome-email/route.ts`
- ⏳ `app/api/send-order-confirmation/route.ts`
- ⏳ `app/api/send-order-update/route.ts`
- ⏳ `app/api/send-review-reminder/route.ts`
- ⏳ `app/api/send-offer-email/route.ts`

### Test/Debug Routes (Optional - Can be removed or simplified)
- ⏳ `app/api/test-db/route.ts`
- ⏳ `app/api/test-functionality/route.ts`

---

## 📊 Conversion Progress

**Total Routes:** ~30  
**Converted:** ~20  
**Remaining:** ~10  
**Progress:** ~67%

---

## 🔧 Key Conversion Patterns Used

### MongoDB → Supabase Query Patterns

**Find One:**
```typescript
// MongoDB
const user = await db.collection("users").findOne({ email: email })

// Supabase
const { data: user } = await supabase
  .from("users")
  .select("*")
  .eq("email", email)
  .single()
```

**Find Many:**
```typescript
// MongoDB
const products = await db.collection("products")
  .find({ category: "winter" })
  .sort({ createdAt: -1 })
  .toArray()

// Supabase
const { data: products } = await supabase
  .from("products")
  .select("*")
  .eq("category", "winter")
  .order("created_at", { ascending: false })
```

**Insert:**
```typescript
// MongoDB
const result = await db.collection("users").insertOne(user)

// Supabase
const { data, error } = await supabase
  .from("users")
  .insert(user)
  .select()
  .single()
```

**Update:**
```typescript
// MongoDB
await db.collection("users").updateOne(
  { _id: new ObjectId(userId) },
  { $set: { name: newName } }
)

// Supabase
await supabase
  .from("users")
  .update({ name: newName })
  .eq("id", userId)
```

**Delete:**
```typescript
// MongoDB
await db.collection("users").deleteOne({ _id: new ObjectId(userId) })

// Supabase
await supabase
  .from("users")
  .delete()
  .eq("id", userId)
```

---

## ⚠️ Important Notes

1. **Field Naming:** All field names converted from camelCase to snake_case
   - `createdAt` → `created_at`
   - `productId` → `product_id`
   - `isActive` → `is_active`

2. **IDs:** Changed from MongoDB ObjectId to UUID strings
   - All `ObjectId` usage removed
   - Using string UUIDs directly

3. **Arrays:** Supabase handles arrays natively
   - `favorites: string[]` works directly
   - Use `.contains()` for array queries

4. **JSON Fields:** Using JSONB for complex objects
   - `sizes`, `notes`, `shipping_address` are JSONB in schema

5. **Error Handling:** Always check `error` before using `data`
   ```typescript
   const { data, error } = await supabase.from("table").select()
   if (error) {
     // Handle error
   }
   // Use data
   ```

6. **Regex Queries:** Supabase doesn't support MongoDB-style regex
   - For pattern matching, fetch data and filter in memory
   - Or use SQL `LIKE` patterns where possible

---

## 🚀 Next Steps

1. Convert remaining routes (discount-codes, offers, contact)
2. Test all converted routes thoroughly
3. Remove MongoDB dependencies from package.json
4. Update any client-side code that directly references MongoDB
5. Update deployment configuration

---

## 📝 Files Modified

### New Files Created
- `lib/supabase.ts` - Supabase client
- `supabase-schema.sql` - Database schema
- `scripts/seed-supabase.js` - Seed script
- `SUPABASE_MIGRATION_GUIDE.md` - Setup guide
- `MIGRATION_STATUS.md` - Migration status
- `CONVERSION_STATUS.md` - This file

### Files Converted (20+)
- All auth routes
- Products routes
- Orders routes
- Favorites route
- Reviews routes (mostly)

### Files Still Using MongoDB
- Remaining routes listed above
- `lib/mongodb.ts` (can be deleted after full migration)
- Various seed scripts (can be archived)

