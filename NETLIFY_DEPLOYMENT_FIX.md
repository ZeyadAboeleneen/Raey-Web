# Netlify Deployment Fix for Offers

## Problem
Offers stopped working when deployed to Netlify, even though they work locally.

## Root Causes

### 1. Missing Environment Variables
The offers API requires Supabase environment variables that must be configured in Netlify:

**Required Environment Variables:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. API Route Caching
Netlify may cache API route responses, causing stale data or preventing new requests from being made.

## Solution

### Step 1: Configure Environment Variables in Netlify

1. Go to your Netlify dashboard
2. Navigate to: **Site settings** → **Environment variables**
3. Add the following variables:

```
NEXT_PUBLIC_SUPABASE_URL = https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key-here
```

**Important Notes:**
- These must start with `NEXT_PUBLIC_` to be available in both client and server code
- The values should match your Supabase project credentials
- After adding variables, you need to **redeploy** your site for changes to take effect

### Step 2: Verify Supabase RLS Policies

Ensure your Supabase database has the correct RLS policy for public read access to offers:

```sql
CREATE POLICY "Offers are viewable by everyone"
  ON offers FOR SELECT
  USING (true);
```

This policy allows anyone (including unauthenticated users) to read from the offers table.

### Step 3: Redeploy

After setting environment variables:
1. Go to **Deploys** tab in Netlify
2. Click **Trigger deploy** → **Deploy site**
3. Wait for the deployment to complete

### Step 4: Test

1. Visit your deployed site
2. Check if the offers banner appears at the top
3. Open browser DevTools → Network tab
4. Look for requests to `/api/offers`
5. Check the response - it should return an array of offers (even if empty)

## Troubleshooting

### Offers still not showing?

1. **Check Netlify Function Logs:**
   - Go to Netlify Dashboard → Your Site → Functions
   - Look for `/api/offers` function
   - Check for any error messages

2. **Verify Environment Variables:**
   - In Netlify, go to Site settings → Environment variables
   - Confirm both variables are set correctly
   - Make sure there are no extra spaces or quotes

3. **Check Browser Console:**
   - Open DevTools → Console
   - Look for errors related to `/api/offers`
   - Common errors:
     - `Missing env.NEXT_PUBLIC_SUPABASE_URL` - Environment variable not set
     - `Failed to fetch offers` - Database connection issue
     - Network errors - API route not accessible

4. **Test API Directly:**
   - Visit: `https://your-site.netlify.app/api/offers`
   - Should return JSON array of offers
   - If you see an error, check the response message

5. **Verify Supabase Connection:**
   - Check if other Supabase features work (products, etc.)
   - If nothing works, verify your Supabase credentials
   - Make sure your Supabase project is active and not paused

### Additional Environment Variables (if needed)

If you have other features that stopped working, you may also need:

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key (for admin operations)
JWT_SECRET=your-jwt-secret
NEXT_PUBLIC_BASE_URL=https://your-site.netlify.app
EMAIL_USER=your-email (for email features)
EMAIL_PASS=your-email-password (for email features)
```

## Prevention

To avoid this issue in the future:

1. **Document all required environment variables** in your README
2. **Use `.env.example` file** to show required variables (without actual values)
3. **Add environment variable checks** in your code (already done in `lib/supabase.ts`)
4. **Test your deployment** after any changes to environment variables

## Code Changes Made

1. **Added cache headers** to the offers API response to prevent Netlify caching
2. **Improved error handling** in the offers banner component
3. **Added better null safety** for offer fields

These changes ensure the API works correctly in both development and production environments.

