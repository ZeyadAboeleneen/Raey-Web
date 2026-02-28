# How to Run the SQL Schema in Supabase

## 📝 Simple Step-by-Step Instructions

You don't need to upload files or link anything to Supabase. Just copy and paste!

---

## Step 1: Open the SQL File

1. **In your code editor** (VS Code or whatever you're using), open the file:
   - File name: `supabase-schema.sql`
   - Location: In the root of your project folder

2. **Select ALL the text** in that file:
   - Press `Ctrl + A` (Windows) to select everything
   - Or click and drag from the beginning to the end

3. **Copy it**:
   - Press `Ctrl + C` to copy

---

## Step 2: Go to Supabase SQL Editor

1. **In your web browser**, make sure you're on the Supabase dashboard
   - URL should be something like: `supabase.com/dashboard/project/jwbonsxidrbmuiopjafj`

2. **Click on "SQL Editor"** in the left sidebar
   - It's usually near the bottom of the sidebar
   - Has a SQL/database icon next to it

3. **Click "New" tab** (if you see one) or just click in the big text box

---

## Step 3: Paste and Run the SQL

1. **Click in the big white text box** (where it says "Hit CTRL+K to generate query...")

2. **Paste the SQL**:
   - Press `Ctrl + V` to paste everything you copied
   - You should see a lot of SQL code appear

3. **Run the SQL**:
   - Look for the green **"Run"** button (usually at the bottom right of the editor)
   - Click it, OR press `Ctrl + J`
   - Wait a few seconds...

4. **Check for success**:
   - You should see a message like "Success. No rows returned" or "Success"
   - If you see errors, let me know what they say!

---

## ✅ That's It!

Once you see "Success", all your database tables have been created!

---

## What Happens Next?

After running the SQL schema, you can:

1. **Check your tables**: Go to "Table Editor" in the left sidebar - you should see tables like:
   - users
   - products
   - orders
   - reviews
   - etc.

2. **Seed the database** (add initial data):
   - In your terminal, run: `node scripts/seed-supabase.js`

---

## ❌ Common Issues

### "Error: relation already exists"
- This means the tables already exist
- That's okay! It means you already ran the schema

### "Error: permission denied"
- Make sure you're logged into the correct Supabase project
- Try refreshing the page

### Nothing happens when I click Run
- Make sure you pasted the SQL code (the box shouldn't be empty)
- Try selecting all the text again and pasting

---

## Need Help?

If you get any errors, copy the error message and let me know!

