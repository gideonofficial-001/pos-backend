# Njugush POS - Deployment Guide

## Fixes Applied

### Critical Bugs Fixed
1. **Fixed `main.ts`**: Changed `useGlobalPipe` (singular - wrong) to `useGlobalPipes` (plural - correct NestJS API)
2. **Fixed `returns.service.ts`**: Line 286 had `};` (missing closing parenthesis) - changed to `});`
3. **Fixed `NewSale.tsx`**: Changed `usenState` typo to `useState`
4. **Fixed unused imports**: Removed `getStatusBadgeColor` import in `NewSale.tsx`
5. **Fixed package.json**: Corrected JSON escaping in Jest testRegex pattern

### Files Created (Total: 62 backend + 83 frontend files)

## Quick Start

### Option 1: Docker Compose (Recommended for local development)

```bash
cd /mnt/okcomputer/output/njugush-pos

# Start all services
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f backend
```

### Option 2: Manual Setup

#### Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
npx prisma migrate dev
npx prisma db seed
npm run start:dev
```

#### Frontend
```bash
cd ../frontend  # or /mnt/okcomputer/output/app
npm install
cp .env.example .env
npm run dev
```

## Deployment

### Backend on Render
1. Connect your GitHub repo to Render
2. Use `render.yaml` (blueprint) for automatic setup
3. Set environment variables in Render dashboard
4. Deploy

### Frontend on Vercel
```bash
cd frontend
vercel --prod
```

Or connect GitHub repo to Vercel for auto-deploy.

### Using GitHub Actions
The `.github/workflows/ci-cd.yml` file is configured for:
- Running tests on every PR
- Building frontend on every push
- Auto-deploying to Render (backend) and Vercel (frontend) on main branch

Set these secrets in GitHub:
- `RENDER_SERVICE_ID`
- `RENDER_API_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin | ceo@njugush.co.ke | admin123 |
| Manager | manager@njugush.co.ke | admin123 |
| Branch Managers | bm1@njugush.co.ke - bm6@njugush.co.ke | admin123 |

## API Endpoints

### Health Check
- `GET /api/health` - Service health status

### Auth
- `POST /api/auth/login` - Login
- `POST /api/auth/device/request` - Request device auth
- `POST /api/auth/device/verify` - Verify device
- `POST /api/auth/logout` - Logout

### Users
- `GET /api/users` - List users
- `POST /api/users` - Create user (Super Admin only)
- `GET /api/users/:id` - Get user
- `PATCH /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user
- `PATCH /api/users/:id/status` - Update status

### Branches
- `GET /api/branches` - List branches
- `POST /api/branches` - Create branch
- `GET /api/branches/:id` - Get branch
- `PATCH /api/branches/:id` - Update branch
- `DELETE /api/branches/:id` - Delete branch

### Products
- `GET /api/products` - List products
- `POST /api/products` - Create product
- `GET /api/products/lpg` - Get LPG products
- `GET /api/products/:id` - Get product
- `PATCH /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Inventory
- `GET /api/inventory` - All inventory
- `GET /api/inventory/branch/:id` - Branch inventory
- `GET /api/inventory/alerts/low-stock` - Low stock alerts
- `GET /api/inventory/reconciliation/cylinders` - Cylinder reconciliation
- `POST /api/inventory/restock` - Restock
- `POST /api/inventory/adjust` - Adjust stock
- `POST /api/inventory/transfer` - Transfer stock

### Sales
- `POST /api/sales` - Create sale
- `GET /api/sales` - List sales
- `GET /api/sales/daily-summary` - Daily summary
- `GET /api/sales/:id` - Get sale
- `GET /api/sales/code/:code` - Find by code

### Invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices` - List invoices
- `GET /api/invoices/:id` - Get invoice
- `PATCH /api/invoices/:id/pay` - Mark as paid
- `PATCH /api/invoices/:id/cancel` - Cancel invoice

### Returns
- `POST /api/returns` - Create return
- `GET /api/returns` - List returns
- `GET /api/returns/:id` - Get return
- `PATCH /api/returns/:id/approve` - Approve return
- `PATCH /api/returns/:id/reject` - Reject return

### Reports
- `GET /api/reports/sales` - Sales report
- `GET /api/reports/inventory` - Inventory report
- `GET /api/reports/cylinder-reconciliation` - Cylinder report
- `GET /api/reports/user-performance` - User performance

### Audit Logs
- `GET /api/audit-logs` - List logs
- `GET /api/audit-logs/by-user/:id` - User logs

### Devices
- `GET /api/devices/pending` - Pending devices
- `POST /api/devices/:id/approve` - Approve device
- `GET /api/devices/my-devices` - My devices
- `POST /api/devices/:id/revoke` - Revoke device

### Notifications
- `GET /api/notifications/dashboard` - Dashboard counts
- `POST /api/notifications/daily-summary` - Send daily summary

## Testing

```bash
# Backend unit tests
cd backend
npm test

# Backend with coverage
npm run test:cov

# E2E tests
npm run test:e2e
```

## Environment Variables

### Backend
```env
DATABASE_URL=postgresql://user:pass@host:5432/db?schema=public
JWT_SECRET=your-secret-key
JWT_EXPIRATION=24h
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-frontend-url.com
CEO_PHONE=+254700000000
CEO_EMAIL=ceo@njugush.co.ke
AT_API_KEY=your-africas-talking-key
AT_USERNAME=your-username
AT_SENDER_ID=NJUGUSH
```

### Frontend
```env
VITE_API_URL=https://your-backend-url.com/api
```

## Project Structure

```
njugush-pos/
├── backend/
│   ├── src/
│   │   ├── auth/         # JWT + device auth
│   │   ├── users/        # User management
│   │   ├── branches/     # Branch management
│   │   ├── products/     # Product catalog
│   │   ├── inventory/    # Stock management
│   │   ├── sales/        # POS sales
│   │   ├── invoices/     # Invoice management
│   │   ├── returns/      # Return processing
│   │   ├── audit-logs/   # Audit trail
│   │   ├── reports/      # Analytics
│   │   ├── notifications/# SMS/Email
│   │   ├── devices/      # Device management
│   │   ├── prisma/       # Prisma service
│   │   ├── main.ts       # Entry point
│   │   ├── app.module.ts  # Root module
│   │   └── health.controller.ts
│   ├── prisma/
│   │   ├── schema.prisma # Database schema
│   │   └── seed.ts       # Seed data
│   ├── test/             # Test configs
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/          # API client
│   │   ├── components/   # UI components
│   │   ├── pages/        # Page components
│   │   ├── store/        # Zustand store
│   │   ├── types/        # TypeScript types
│   │   ├── utils/        # Utilities
│   │   └── App.tsx       # Root component
│   ├── Dockerfile
│   ├── vercel.json
│   └── package.json
│
├── .github/workflows/     # CI/CD
├── render.yaml           # Render config
└── README.md
```

## Troubleshooting

### Build fails on Vercel/Render
1. Check `NODE_ENV` is set to `production`
2. Verify `DATABASE_URL` is correct
3. Ensure `JWT_SECRET` is set

### Prisma errors
```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

### CORS issues
Update `FRONTEND_URL` in backend `.env` to match your frontend URL.

## License
Private - Njugush Enterprises
