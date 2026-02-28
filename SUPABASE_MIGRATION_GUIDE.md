# Complete Supabase Migration Guide for Alanod Website

## Overview
This guide will help you migrate from MongoDB to Supabase step-by-step. Follow these instructions carefully.

---

## Step 1: Create a Supabase Account

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"Start your project"** or **"Sign up"**
3. Sign up using:
   - GitHub (recommended)
   - Email
   - Or any other available method
4. Verify your email if needed

---

## Step 2: Create a New Project

1. Once logged in, click **"New Project"**
2. Fill in the project details:
   - **Name**: `alanod-website` (or any name you prefer)
   - **Database Password**: Create a strong password (SAVE THIS - you'll need it!)
   - **Region**: Choose the region closest to your users
   - **Pricing Plan**: Select **"Free"** (you can upgrade later)
3. Click **"Create new project"**
4. Wait 1-2 minutes for your project to be set up

---

## Step 3: Get Your Supabase Credentials

Once your project is ready:

1. Go to **Settings** (gear icon) in the left sidebar
2. Click **"API"** in the settings menu
3. You'll see two important values:
   - **Project URL** (starts with `https://`)
   - **anon public** key (a long string)
4. Click on **"Project Settings"** → **"API"** to also find:
   - **service_role** key (keep this secret! Never expose it in client-side code)

**Copy these values - you'll need them in Step 5!**

---

## Step 4: Set Up the Database Schema

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase-schema.sql` in your project
4. Copy ALL the SQL code from that file
5. Paste it into the SQL Editor
6. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
7. Wait for it to complete - you should see "Success. No rows returned"

This creates all the tables, indexes, and security policies you need.

---

## Step 5: Update Environment Variables

1. Open your `.env.local` file in your project root
2. Remove or comment out the MongoDB line:
   ```
   # MONGODB_URI=mongodb://localhost:27017/sense_fragrances
   ```
3. Add your Supabase credentials:
   ```env
   # Supabase Configuration
   NEXT_PUBLIC_SUPABASE_URL=your-project-url-here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   
   # Keep your existing JWT secret
   JWT_SECRET=your-super-secret-jwt-key-here
   
   # Email Configuration (Gmail)
   EMAIL_USER=sensefragrances1@gmail.com
   EMAIL_PASS=oopg ejhq tfil firm
   
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   ```

**Important:** 
- Replace `your-project-url-here` with your Project URL from Step 3
- Replace `your-anon-key-here` with your anon public key
- Replace `your-service-role-key-here` with your service_role key

---

## Step 6: Install Dependencies

Run this command in your terminal (in your project folder):

```bash
pnpm install
```

This ensures Supabase is installed. It should already be installed, but this confirms it.

---

## Step 7: Seed the Database (Add Initial Data)

I've created a seed script for you. But first, you need to convert it to use Supabase.

**Option A: Use the Supabase Dashboard (Easier for first time)**
1. Go to **"Table Editor"** in your Supabase dashboard
2. Click on the **"users"** table
3. Click **"Insert row"**
4. Add a test admin user:
   - Email: `admin@alanod.com`
   - Password: (we'll hash this - see below)
   - Name: `Admin User`
   - Role: `admin`

**To hash the password:**
- In your project, run: `node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('admin123', 12).then(h => console.log(h))"`
- Copy the hashed password and paste it in the password field

**Option B: Run the seed script** (after I complete the conversion)

---

## Step 8: Test the Connection

1. Make sure your development server is stopped (Ctrl+C if running)
2. Start it again:
   ```bash
   pnpm dev
   ```
3. Open your browser to `http://localhost:3000`
4. Try to register a new user or login
5. Check the terminal for any errors

---

## Step 9: Migrate Existing Data (If You Have Any)

If you have existing data in MongoDB:

1. Export your data from MongoDB
2. Transform it to match the new Supabase schema
3. Import it using Supabase dashboard or API

**For now, you can start fresh with the new Supabase database.**

---

## Troubleshooting

### Error: "Missing env.NEXT_PUBLIC_SUPABASE_URL"
- Make sure your `.env.local` file has the correct variable names
- Restart your development server after adding environment variables

### Error: "relation does not exist"
- Make sure you ran the SQL schema file in Step 4
- Check that all tables were created in the "Table Editor"

### Authentication errors
- Verify your JWT_SECRET is set correctly
- Check that user passwords are properly hashed

### Connection errors
- Verify your Project URL and API keys are correct
- Check that your project is active (not paused) in Supabase dashboard

---

## Next Steps After Migration

1. ✅ Test all authentication flows (login, register, logout)
2. ✅ Test product listing and details
3. ✅ Test adding to cart and checkout
4. ✅ Test favorites functionality
5. ✅ Test admin dashboard (if applicable)
6. ✅ Test email functionality

---

## Important Notes

1. **Free Tier Limits:**
   - 500MB database space
   - 2GB bandwidth per month
   - 50,000 monthly active users
   - If you need more, you can upgrade later

2. **Security:**
   - Never commit your `.env.local` file to git
   - Never expose your `SUPABASE_SERVICE_ROLE_KEY` in client-side code
   - The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe for client-side use

3. **Backup:**
   - Supabase free tier includes automatic backups
   - You can also export your data anytime from the dashboard

---

## Need Help?

- Supabase Documentation: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com
- Check the terminal for error messages
- Check browser console for client-side errors

---

## Files Changed in This Migration

- ✅ `lib/supabase.ts` - New Supabase client
- ✅ `lib/models/types.ts` - Updated types (removed ObjectId)
- ✅ `supabase-schema.sql` - Database schema
- ✅ `app/api/auth/login/route.ts` - Converted to Supabase
- ✅ `app/api/auth/register/route.ts` - Converted to Supabase
- ⏳ More API routes to convert (products, orders, favorites, reviews, etc.)

---

**Status:** Migration in progress. Some API routes still need conversion.

