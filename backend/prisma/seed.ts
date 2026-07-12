import { PrismaClient, UserRole, ProductType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting Njugush POS database seed...');

  // 1. Create Branches
  const branches = await Promise.all([
    prisma.branch.upsert({
      where: { code: 'HQ' },
      update: {},
      create: { name: 'Headquarters', code: 'HQ', address: 'Main Street, Nairobi', phone: '+254700000001', email: 'hq@njugush.co.ke' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR01' },
      update: {},
      create: { name: 'Branch 1 - Westlands', code: 'BR01', address: 'Westlands, Nairobi', phone: '+254700000002', email: 'westlands@njugush.co.ke' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR02' },
      update: {},
      create: { name: 'Branch 2 - Eastleigh', code: 'BR02', address: 'Eastleigh, Nairobi', phone: '+254700000003', email: 'eastleigh@njugush.co.ke' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR03' },
      update: {},
      create: { name: 'Branch 3 - Karen', code: 'BR03', address: 'Karen, Nairobi', phone: '+254700000004', email: 'karen@njugush.co.ke' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR04' },
      update: {},
      create: { name: 'Branch 4 - Ngong Road', code: 'BR04', address: 'Ngong Road, Nairobi', phone: '+254700000005', email: 'ngong@njugush.co.ke' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR05' },
      update: {},
      create: { name: 'Branch 5 - Mombasa Road', code: 'BR05', address: 'Mombasa Road, Nairobi', phone: '+254700000006', email: 'mombasaroad@njugush.co.ke' },
    }),
    prisma.branch.upsert({
      where: { code: 'BR06' },
      update: {},
      create: { name: 'Branch 6 - Thika Road', code: 'BR06', address: 'Thika Road, Nairobi', phone: '+254700000007', email: 'thikaroad@njugush.co.ke' },
    }),
  ]);

  console.log(`Created ${branches.length} branches`);

  // 2. Create Users
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  await prisma.user.upsert({
    where: { email: 'ceo@njugush.co.ke' },
    update: {},
    create: { email: 'ceo@njugush.co.ke', password: hashedPassword, firstName: 'Njugush', lastName: 'CEO', phone: '+254727202653', role: UserRole.SUPER_ADMIN, status: 'ACTIVE', branchId: branches[0].id },
  });

  await prisma.user.upsert({
    where: { email: 'manager@njugush.co.ke' },
    update: {},
    create: { email: 'manager@njugush.co.ke', password: hashedPassword, firstName: 'Overall', lastName: 'Manager', phone: '+254711111111', role: UserRole.OVERALL_MANAGER, status: 'ACTIVE' },
  });

  for (let i = 1; i < branches.length; i++) {
    await prisma.user.upsert({
      where: { email: `bm${i}@njugush.co.ke` },
      update: {},
      create: { email: `bm${i}@njugush.co.ke`, password: hashedPassword, firstName: `Branch${i}`, lastName: 'Manager', phone: `+25472222222${i}`, role: UserRole.BRANCH_MANAGER, status: 'ACTIVE', branchId: branches[i].id },
    });
  }

  // 3. Create the Starter Pack Categories
  const categoryNames = ['3Kg LPG', '6Kg LPG', '13Kg LPG', '45Kg LPG', 'Accessories', 'Electronics'];
  const categories: Record<string, string> = {};
  
  for (const name of categoryNames) {
    const cat = await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categories[name] = cat.id;
  }
  console.log(`Created ${Object.keys(categories).length} categories`);

  // 4. Create Starter Pack Products
  const brands = ['K-Gas', 'Supa Gas', 'Afri Gas', 'Hashi', 'Sea Gas', 'Total', 'Jamii', 'Pro Gas', 'Top Gas'];
  const products = [];

  // Seed 6Kg Products (Refill: 1400, Empty: 3000)
  for (const brand of brands) {
    const code = `6KG-${brand.toUpperCase().replace(/\s+/g, '')}`;
    const product = await prisma.product.upsert({
      where: { code },
      update: {},
      create: { 
        name: `${brand} 6Kg`, 
        code, 
        type: ProductType.LPG_REFILL, 
        categoryId: categories['6Kg LPG'], 
        price: 1400, 
        emptyPrice: 3000,
        isCylinderTracked: true, 
        minStockLevel: 10 
      },
    });
    products.push(product);
  }

  // Seed 13Kg Products (Refill: 3000, Empty: 5000)
  for (const brand of brands) {
    const code = `13KG-${brand.toUpperCase().replace(/\s+/g, '')}`;
    const product = await prisma.product.upsert({
      where: { code },
      update: {},
      create: { 
        name: `${brand} 13Kg`, 
        code, 
        type: ProductType.LPG_REFILL, 
        categoryId: categories['13Kg LPG'], 
        price: 3000, 
        emptyPrice: 5000,
        isCylinderTracked: true, 
        minStockLevel: 10 
      },
    });
    products.push(product);
  }
  
  console.log(`Created ${products.length} LPG products`);

  // 5. Initialize Inventory for all branches
  for (const branch of branches) {
    for (const product of products) {
      await prisma.inventory.upsert({
        where: { branchId_productId: { branchId: branch.id, productId: product.id } },
        update: {},
        create: {
          branchId: branch.id,
          productId: product.id,
          quantity: 20, // Total physical shells (20 full + 0 empty = 20)
          fullCylinders: 20,
        },
      });
    }
  }
  console.log('Initialized stock trackers for all branches');

  // 6. Settings and Customers
  const settingsData = [
    { key: 'CEO_PHONE', value: '+254727202653', description: 'CEO phone number', isPublic: true },
    { key: 'CEO_EMAIL', value: 'ceo@njugush.co.ke', description: 'CEO email address', isPublic: false },
    { key: 'SMS_ENABLED', value: 'true', description: 'Enable SMS', isPublic: true },
    { key: 'DAILY_CLOSE_TIME', value: '21:00', description: 'Daily closing time', isPublic: true },
    { key: 'LOW_STOCK_ALERT', value: 'true', description: 'Enable low stock alerts', isPublic: true },
    { key: 'MPESA_PAYBILL', value: '247247', description: 'M-Pesa Paybill', isPublic: true },
  ];

  for (const s of settingsData) {
    await prisma.systemSetting.upsert({ where: { key: s.key }, update: {}, create: s });
  }

  const customersData = [
    { code: 'CUST-0001', name: 'John Kamau', phone: '+254712345678', email: 'john@example.com', credit: 50000 },
    { code: 'CUST-0002', name: 'Mary Wanjiku', phone: '+254723456789', email: 'mary@example.com', credit: 30000 },
    { code: 'CUST-0003', name: 'Peter Ochieng', phone: '+254734567890', biz: 'Ochieng Gas Ltd', credit: 100000 },
  ];

  for (const c of customersData) {
    await prisma.customer.upsert({
      where: { phone: c.phone },
      update: {},
      create: { customerCode: c.code, fullName: c.name, phone: c.phone, email: c.email, businessName: c.biz, creditLimit: c.credit, isInvoiceEligible: true },
    });
  }

  console.log('\n========================================');
  console.log('  SEED COMPLETED SUCCESSFULLY');
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
