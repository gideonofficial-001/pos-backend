import { PrismaClient, UserRole, ProductType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create branches (7 branches for Njugush Enterprises)
  const branches = await Promise.all([
    prisma.branch.upsert({
      where: { code: 'HQ' },
      update: {},
      create: {
        name: 'Headquarters',
        code: 'HQ',
        address: 'Main Street, Nairobi',
        phone: '+254700000001',
        email: 'hq@njugush.co.ke',
      },
    }),
    prisma.branch.upsert({
      where: { code: 'BR01' },
      update: {},
      create: {
        name: 'Branch 1 - Westlands',
        code: 'BR01',
        address: 'Westlands, Nairobi',
        phone: '+254700000002',
        email: 'westlands@njugush.co.ke',
      },
    }),
    prisma.branch.upsert({
      where: { code: 'BR02' },
      update: {},
      create: {
        name: 'Branch 2 - Eastleigh',
        code: 'BR02',
        address: 'Eastleigh, Nairobi',
        phone: '+254700000003',
        email: 'eastleigh@njugush.co.ke',
      },
    }),
    prisma.branch.upsert({
      where: { code: 'BR03' },
      update: {},
      create: {
        name: 'Branch 3 - Karen',
        code: 'BR03',
        address: 'Karen, Nairobi',
        phone: '+254700000004',
        email: 'karen@njugush.co.ke',
      },
    }),
    prisma.branch.upsert({
      where: { code: 'BR04' },
      update: {},
      create: {
        name: 'Branch 4 - Ngong Road',
        code: 'BR04',
        address: 'Ngong Road, Nairobi',
        phone: '+254700000005',
        email: 'ngong@njugush.co.ke',
      },
    }),
    prisma.branch.upsert({
      where: { code: 'BR05' },
      update: {},
      create: {
        name: 'Branch 5 - Mombasa Road',
        code: 'BR05',
        address: 'Mombasa Road, Nairobi',
        phone: '+254700000006',
        email: 'mombasaroad@njugush.co.ke',
      },
    }),
    prisma.branch.upsert({
      where: { code: 'BR06' },
      update: {},
      create: {
        name: 'Branch 6 - Thika Road',
        code: 'BR06',
        address: 'Thika Road, Nairobi',
        phone: '+254700000007',
        email: 'thikaroad@njugush.co.ke',
      },
    }),
  ]);

  console.log(`Created ${branches.length} branches`);

  // Create Super Admin (CEO)
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'ceo@njugush.co.ke' },
    update: {},
    create: {
      email: 'ceo@njugush.co.ke',
      password: hashedPassword,
      firstName: 'Njugush',
      lastName: 'CEO',
      phone: '+254700000000',
      role: UserRole.SUPER_ADMIN,
      status: 'ACTIVE',
    },
  });

  console.log('Created Super Admin (CEO)');

  // Create Overall Manager
  const manager = await prisma.user.upsert({
    where: { email: 'manager@njugush.co.ke' },
    update: {},
    create: {
      email: 'manager@njugush.co.ke',
      password: hashedPassword,
      firstName: 'Overall',
      lastName: 'Manager',
      phone: '+254711111111',
      role: UserRole.OVERALL_MANAGER,
      status: 'ACTIVE',
    },
  });

  console.log('Created Overall Manager');

  // Create Branch Managers for each branch
  const branchManagers = await Promise.all(
    branches.slice(1).map(async (branch, index) => {
      return prisma.user.upsert({
        where: { email: `bm${index + 1}@njugush.co.ke` },
        update: {},
        create: {
          email: `bm${index + 1}@njugush.co.ke`,
          password: hashedPassword,
          firstName: `Branch${index + 1}`,
          lastName: 'Manager',
          phone: `+25472222222${index + 1}`,
          role: UserRole.BRANCH_MANAGER,
          status: 'ACTIVE',
          branchId: branch.id,
        },
      });
    }),
  );

  console.log(`Created ${branchManagers.length} Branch Managers`);

  // Create LPG Products
  const lpgProducts = await Promise.all([
    prisma.product.upsert({
      where: { code: 'LPG-6KG' },
      update: {},
      create: {
        name: 'LPG Refill 6kg',
        code: 'LPG-6KG',
        description: '6kg LPG gas refill',
        type: ProductType.LPG_REFILL,
        price: 1200.00,
        costPrice: 1000.00,
        cylinderSize: '6kg',
        minStockLevel: 20,
      },
    }),
    prisma.product.upsert({
      where: { code: 'LPG-13KG' },
      update: {},
      create: {
        name: 'LPG Refill 13kg',
        code: 'LPG-13KG',
        description: '13kg LPG gas refill',
        type: ProductType.LPG_REFILL,
        price: 2800.00,
        costPrice: 2400.00,
        cylinderSize: '13kg',
        minStockLevel: 15,
      },
    }),
    prisma.product.upsert({
      where: { code: 'LPG-45KG' },
      update: {},
      create: {
        name: 'LPG Refill 45kg',
        code: 'LPG-45KG',
        description: '45kg LPG gas refill (Commercial)',
        type: ProductType.LPG_REFILL,
        price: 8500.00,
        costPrice: 7500.00,
        cylinderSize: '45kg',
        minStockLevel: 5,
      },
    }),
    // Cylinder Sales
    prisma.product.upsert({
      where: { code: 'CYL-6KG-TOTAL' },
      update: {},
      create: {
        name: '6kg Cylinder (Total)',
        code: 'CYL-6KG-TOTAL',
        description: '6kg Gas Cylinder - Total Brand',
        type: ProductType.LPG_CYLINDER,
        price: 4500.00,
        costPrice: 3800.00,
        cylinderSize: '6kg',
        brand: 'Total',
        minStockLevel: 10,
      },
    }),
    prisma.product.upsert({
      where: { code: 'CYL-13KG-KGAS' },
      update: {},
      create: {
        name: '13kg Cylinder (K-Gas)',
        code: 'CYL-13KG-KGAS',
        description: '13kg Gas Cylinder - K-Gas Brand',
        type: ProductType.LPG_CYLINDER,
        price: 8500.00,
        costPrice: 7200.00,
        cylinderSize: '13kg',
        brand: 'K-Gas',
        minStockLevel: 8,
      },
    }),
    // Electronics
    prisma.product.upsert({
      where: { code: 'REG-001' },
      update: {},
      create: {
        name: 'Gas Regulator Standard',
        code: 'REG-001',
        description: 'Standard LPG Gas Regulator',
        type: ProductType.ELECTRONICS,
        price: 450.00,
        costPrice: 280.00,
        minStockLevel: 30,
      },
    }),
    prisma.product.upsert({
      where: { code: 'PIPE-001' },
      update: {},
      create: {
        name: 'Gas Pipe (1 meter)',
        code: 'PIPE-001',
        description: 'LPG Gas Pipe - 1 meter',
        type: ProductType.ELECTRONICS,
        price: 150.00,
        costPrice: 80.00,
        minStockLevel: 50,
      },
    }),
    prisma.product.upsert({
      where: { code: 'BURN-001' },
      update: {},
      create: {
        name: 'Gas Burner Single',
        code: 'BURN-001',
        description: 'Single Gas Burner',
        type: ProductType.ELECTRONICS,
        price: 850.00,
        costPrice: 550.00,
        minStockLevel: 15,
      },
    }),
  ]);

  console.log(`Created ${lpgProducts.length} products`);

  // Initialize inventory for all branches
  for (const branch of branches) {
    for (const product of lpgProducts) {
      await prisma.inventory.upsert({
        where: {
          branchId_productId: {
            branchId: branch.id,
            productId: product.id,
          },
        },
        update: {},
        create: {
          branchId: branch.id,
          productId: product.id,
          quantity: product.type === ProductType.LPG_REFILL ? 50 : 20,
          fullCylinders: product.type === ProductType.LPG_REFILL ? 50 : null,
          emptyCylinders: product.type === ProductType.LPG_REFILL ? 0 : null,
        },
      });
    }
  }

  console.log('Initialized inventory for all branches');
  console.log('Database seed completed successfully!');
  console.log('');
  console.log('=== DEFAULT CREDENTIALS ===');
  console.log('Super Admin: ceo@njugush.co.ke / admin123');
  console.log('Manager: manager@njugush.co.ke / admin123');
  console.log('Branch Managers: bm1@njugush.co.ke - bm6@njugush.co.ke / admin123');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
