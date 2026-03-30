# Njugush Enterprises POS & Inventory Management System - Backend

A production-level NestJS backend for managing multi-branch POS and inventory operations.

## 🏗️ Architecture

- **Framework**: NestJS (Node.js)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT with device fingerprinting
- **API**: RESTful

## 📁 Project Structure

```
src/
├── auth/               # Authentication & Authorization
├── users/              # User management
├── branches/           # Branch management
├── products/           # Product catalog
├── inventory/          # Stock management
├── sales/              # POS sales operations
├── invoices/           # Invoice management
├── returns/            # Return processing
├── audit-logs/         # Audit trail
├── reports/            # Analytics & reporting
├── notifications/      # SMS/Email notifications
├── devices/            # Device management
├── prisma/             # Database schema & migrations
└── main.ts             # Application entry point
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Set up the database**:
   ```bash
   # Generate Prisma client
   npx prisma generate

   # Run migrations
   npx prisma migrate dev

   # Seed the database
   npx prisma db seed
   ```

4. **Start the development server**:
   ```bash
   npm run start:dev
   ```

The API will be available at `http://localhost:3000/api`

## 🔐 Default Credentials

After seeding, these accounts are available:

| Role | Email | Password |
|------|-------|----------|
| Super Admin (CEO) | ceo@njugush.co.ke | admin123 |
| Overall Manager | manager@njugush.co.ke | admin123 |
| Branch Manager 1 | bm1@njugush.co.ke | admin123 |
| Branch Manager 2 | bm2@njugush.co.ke | admin123 |
| ... | ... | ... |
| Branch Manager 6 | bm6@njugush.co.ke | admin123 |

## 📚 API Endpoints

### Authentication
- `POST /api/auth/login` - Login with device fingerprinting
- `POST /api/auth/device/request` - Request device authorization
- `POST /api/auth/device/verify` - Verify device with code
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users` - List all users
- `POST /api/users` - Create user (Super Admin only)
- `GET /api/users/:id` - Get user details
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `PATCH /api/users/:id/status` - Update user status

### Branches
- `GET /api/branches` - List all branches
- `POST /api/branches` - Create branch (Super Admin only)
- `GET /api/branches/:id` - Get branch details with inventory
- `PATCH /api/branches/:id` - Update branch
- `DELETE /api/branches/:id` - Delete branch

### Products
- `GET /api/products` - List all products
- `POST /api/products` - Create product (Super Admin only)
- `GET /api/products/lpg` - Get LPG products
- `GET /api/products/:id` - Get product details
- `PATCH /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Inventory
- `GET /api/inventory` - Get all inventory (Admin/Manager)
- `GET /api/inventory/branch/:branchId` - Get branch inventory
- `GET /api/inventory/alerts/low-stock` - Get low stock alerts
- `GET /api/inventory/reconciliation/cylinders` - Cylinder reconciliation
- `POST /api/inventory/restock` - Restock inventory (Super Admin only)
- `POST /api/inventory/adjust` - Adjust stock (Super Admin only)
- `POST /api/inventory/transfer` - Transfer stock between branches

### Sales
- `POST /api/sales` - Create sale (Branch Manager)
- `GET /api/sales` - List sales
- `GET /api/sales/daily-summary` - Get daily sales summary
- `GET /api/sales/:id` - Get sale details
- `GET /api/sales/code/:saleCode` - Find sale by code

### Invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices` - List invoices
- `GET /api/invoices/:id` - Get invoice details
- `PATCH /api/invoices/:id/pay` - Mark invoice as paid
- `PATCH /api/invoices/:id/cancel` - Cancel invoice

### Returns
- `POST /api/returns` - Create return request
- `GET /api/returns` - List returns
- `GET /api/returns/:id` - Get return details
- `PATCH /api/returns/:id/approve` - Approve return (Super Admin)
- `PATCH /api/returns/:id/reject` - Reject return (Super Admin)

### Reports
- `GET /api/reports/sales?startDate=&endDate=&branchId=` - Sales report
- `GET /api/reports/inventory?branchId=` - Inventory report
- `GET /api/reports/cylinder-reconciliation?branchId=` - Cylinder reconciliation
- `GET /api/reports/user-performance?startDate=&endDate=` - User performance

### Audit Logs
- `GET /api/audit-logs` - List audit logs
- `GET /api/audit-logs/by-user/:userId` - Get user activity

### Devices
- `GET /api/devices/pending` - Get pending device requests
- `POST /api/devices/:id/approve` - Approve device
- `GET /api/devices/my-devices` - Get user's devices
- `POST /api/devices/:id/revoke` - Revoke device access

## 🔑 Key Features

### 1. Role-Based Access Control
- **Super Admin**: Full access to all operations
- **Overall Manager**: Read-only access, device approvals
- **Branch Manager**: Limited to assigned branch, sales only

### 2. Device Fingerprinting
- One device per user
- New devices require authorization code
- All login attempts logged

### 3. LPG Cylinder Tracking
- Separate tracking for full and empty cylinders
- Automatic reconciliation
- Discrepancy detection

### 4. Audit Trail
- Immutable logs for all operations
- User action tracking
- Stock change history

### 5. Sales Processing
- Cash and Invoice sales
- Unique sale codes (6-8 chars + year)
- Sales after 9PM count as next day

### 6. Return Management
- Return requests require admin approval
- Automatic stock reversal
- No sale deletion allowed

## 🛠️ Development Commands

```bash
# Development
npm run start:dev

# Build
npm run build

# Production
npm run start:prod

# Database
npm run prisma:generate    # Generate Prisma client
npm run prisma:migrate     # Run migrations
npm run prisma:studio      # Open Prisma Studio
npm run prisma:seed        # Seed database

# Testing
npm run test
npm run test:e2e
```

## 📝 Environment Variables

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/njugush_pos?schema=public"

# JWT
JWT_SECRET="your-super-secret-key"
JWT_EXPIRATION="24h"

# App
PORT=3000
NODE_ENV=development
FRONTEND_URL="http://localhost:5173"
```

## 🔒 Security Features

- JWT-based authentication
- Bcrypt password hashing
- Device fingerprinting
- Role-based access control
- Immutable audit logs
- Branch access restrictions

## 📊 Database Schema

The system includes these main entities:
- **Users**: Staff with different roles
- **Branches**: 7 business locations
- **Products**: LPG, cylinders, electronics
- **Inventory**: Stock per branch
- **Sales**: Transaction records
- **Invoices**: Customer invoices
- **Returns**: Return requests
- **AuditLogs**: Activity tracking
- **Devices**: Authorized devices

## 🚢 Deployment

### Render (Recommended)
1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically

### VPS
1. Build the application: `npm run build`
2. Set up PostgreSQL
3. Configure environment variables
4. Run: `npm run start:prod`

## 📞 Support

For issues or questions, contact the development team.

---

**Njugush Enterprises** - Built with ❤️ using NestJS & Prisma
