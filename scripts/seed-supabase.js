/**
 * Seed script for Supabase database
 * Run with: node scripts/seed-supabase.js
 * 
 * Make sure your .env.local file has:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (for admin operations)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
});

async function seedDatabase() {
  try {
    console.log('🔄 Starting database seeding...\n');

    // Seed users
    console.log('👥 Seeding users...');
    const hashedAdminPassword = await bcrypt.hash('admin123', 12);
    const hashedUserPassword = await bcrypt.hash('user123', 12);

    const users = [
      {
        email: 'admin@alanod.com',
        password: hashedAdminPassword,
        name: 'Admin User',
        role: 'admin',
      },
      {
        email: 'user@example.com',
        password: hashedUserPassword,
        name: 'John Doe',
        role: 'user',
      },
    ];

    // Clear existing users (optional - remove if you want to keep existing data)
    const { error: deleteError } = await supabase
      .from('users')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

    // Insert users
    const { data: insertedUsers, error: usersError } = await supabase
      .from('users')
      .insert(users)
      .select();

    if (usersError) {
      console.error('❌ Error seeding users:', usersError);
    } else {
      console.log(`✅ ${insertedUsers?.length || 0} users seeded successfully\n`);
    }

    // Seed products (sample data)
    console.log('🧴 Seeding products...');
    
    const products = [
      {
        product_id: 'midnight-essence',
        name: 'Midnight Essence',
        description: 'A bold and mysterious fragrance with notes of bergamot, cedar, and amber',
        long_description: 'Midnight Essence captures the allure of the night with its sophisticated blend of citrus freshness and woody depth.',
        price: 120,
        sizes: [
          { size: 'Travel', volume: '15ml', originalPrice: 45, discountedPrice: 45 },
          { size: 'Standard', volume: '50ml', originalPrice: 120, discountedPrice: 120 },
          { size: 'Large', volume: '100ml', originalPrice: 180, discountedPrice: 180 },
        ],
        images: ['/placeholder.svg', '/placeholder.svg', '/placeholder.svg'],
        rating: 4.8,
        reviews: 127,
        notes: {
          top: ['Bergamot', 'Black Pepper', 'Lemon'],
          middle: ['Cedar', 'Lavender', 'Geranium'],
          base: ['Amber', 'Vanilla', 'Musk'],
        },
        category: 'winter',
        is_bestseller: true,
        is_new: false,
        is_active: true,
        is_out_of_stock: false,
      },
      {
        product_id: 'rose-noir',
        name: 'Rose Noir',
        description: 'Elegant and romantic with dark rose, patchouli, and vanilla',
        long_description: 'Rose Noir is an intoxicating blend that celebrates the darker side of femininity.',
        price: 130,
        sizes: [
          { size: 'Travel', volume: '15ml', originalPrice: 50, discountedPrice: 50 },
          { size: 'Standard', volume: '50ml', originalPrice: 130, discountedPrice: 130 },
          { size: 'Large', volume: '100ml', originalPrice: 195, discountedPrice: 195 },
        ],
        images: ['/placeholder.svg', '/placeholder.svg', '/placeholder.svg'],
        rating: 4.9,
        reviews: 203,
        notes: {
          top: ['Bulgarian Rose', 'Pink Pepper', 'Bergamot'],
          middle: ['Dark Rose', 'Patchouli', 'Jasmine'],
          base: ['Vanilla', 'Sandalwood', 'Amber'],
        },
        category: 'summer',
        is_bestseller: true,
        is_new: false,
        is_active: true,
        is_out_of_stock: false,
      },
    ];

    // Clear existing products (optional)
    const { error: deleteProductsError } = await supabase
      .from('products')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert products
    const { data: insertedProducts, error: productsError } = await supabase
      .from('products')
      .insert(products)
      .select();

    if (productsError) {
      console.error('❌ Error seeding products:', productsError);
    } else {
      console.log(`✅ ${insertedProducts?.length || 0} products seeded successfully\n`);
    }

    console.log('✅ Database seeding completed!\n');
    console.log('📝 Admin credentials:');
    console.log('   Email: admin@alanod.com');
    console.log('   Password: admin123\n');
    console.log('📝 User credentials:');
    console.log('   Email: user@example.com');
    console.log('   Password: user123\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();

