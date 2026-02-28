# Quick Setup Steps - Supabase Project

## ✅ Step 1: Run the Database Schema (You're Here Now!)

Since you're in the SQL Editor:

1. **Copy the entire contents** of `supabase-schema.sql` file
2. **Paste it** into the SQL Editor (where it says "Hit CTRL+K to generate query...")
3. **Click the green "Run" button** (or press `CTRL+J`)
4. Wait for it to finish - you should see a success message

This will create all the tables you need!

---

## ✅ Step 2: Get Your API Keys

1. **In Supabase dashboard**, click on the **Settings icon** (gear icon) in the left sidebar
2. Click **"API"** in the settings menu
3. You'll see:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)
   - **service_role** key (long string, click "Reveal" to see it)

4. **Copy these values** - you'll need them next!

---

## ✅ Step 3: Update Your .env.local File

1. **Open** `.env.local` file in your project folder
2. **Remove or comment out** the MongoDB line:
   ```env
   # MONGODB_URI=mongodb://localhost:27017/sense_fragrances
   ```

3. **Add your Supabase credentials** (replace with your actual values):
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

   # Keep your existing values
   JWT_SECRET=your-super-secret-jwt-key-here
   EMAIL_USER=sensefragrances1@gmail.com
   EMAIL_PASS=oopg ejhq tfil firm
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

**Important:** Replace the `xxxxx` parts with your actual values from Step 2!

---

## ✅ Step 4: Seed the Database (Add Initial Data)

Run this command in your terminal (in your project folder):

```bash
node scripts/seed-supabase.js
```

This will add:
- Sample products
- An admin user (email: `admin@alanod.com`, password: `admin123`)
- Sample discount codes
- Sample offers

---

## ✅ Step 5: Test It!

1. **Start your development server**:
   ```bash
   pnpm dev
   ```

2. **Open** `http://localhost:3000` in your browser

3. **Test the connection**:
   - Go to `http://localhost:3000/api/test-db`
   - You should see database connection info
   - Check the terminal for any errors

4. **Try logging in**:
   - Email: `admin@alanod.com`
   - Password: `admin123`

---

## 🎉 Done!

Your Supabase setup is complete! The website should now work with Supabase instead of MongoDB.

---

## ❌ Having Issues?

### Error: "Missing env.NEXT_PUBLIC_SUPABASE_URL"
- Make sure you added the Supabase variables to `.env.local`
- Restart your dev server after updating `.env.local`

### Error: "relation does not exist"
- Make sure you ran the SQL schema in Step 1
- Check that all tables were created (go to "Table Editor" in Supabase)

### Can't login with admin account
- Make sure you ran the seed script in Step 4
- Check the users table in Supabase Table Editor

