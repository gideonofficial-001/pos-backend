# Njugush Enterprises POS & Inventory Management System

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
</p>

<p align="center">
  <b>A comprehensive Point of Sale and Inventory Management System</b> built for Njugush Enterprises, featuring multi-branch operations, role-based access control, real-time inventory tracking, and automated notifications.
</p>

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [User Roles](#user-roles)
- [License](#license)

---

## Features

### Core POS Functionality
- **New Sales** - Cash and invoice sales with barcode search, cart management, and discount application
- **Sales History** - Calendar-based search and filtering by sale type
- **Invoice Management** - Customer invoicing with SMS delivery
- **Returns Processing** - 6-character code lookup with admin approval workflow
- **Expense Tracking** - Category-based expenses with approval workflow

### Inventory Management
- **Multi-Branch Inventory** - Real-time stock tracking across all branches
- **Stock Adjustments** - Manual adjustments with audit trail
- **Low Stock Alerts** - Automatic notifications when inventory falls below threshold
- **Inter-Branch Transfers** - Request and approval workflow for stock transfers
- **Inventory Valuation** - Comprehensive reporting on stock value and potential profit

### User Management & Security
- **Role-Based Access Control** - Three distinct roles (Super Admin, Overall Manager, Branch Manager)
- **Device Authentication** - Hardware fingerprinting with 6-digit email verification codes
- **Audit Logging** - Complete activity trail for compliance
- **Account Status Management** - Active, inactive, and suspended states

### Reporting & Analytics
- **Dashboard Statistics** - Real-time KPIs and performance metrics
- **Sales Trend Analysis** - Visual charts for revenue tracking
- **Branch Performance** - Comparative analysis across locations
- **Product Performance** - Sales velocity and profitability metrics

### Notifications & Communication
- **Activity Feed** - Real-time activity stream
- **Pending Approvals Dashboard** - Centralized approval management
- **Email Notifications** - Automated alerts for device auth, returns, transfers, and expenses

---

## Architecture

The system follows a modern client-server architecture with clear separation of concerns:

```
Njugush POS System
|
|-- backend/          NestJS API server
|   |-- src/
|   |   |-- auth/         Authentication & device management
|   |   |-- users/        User CRUD operations
|   |   |-- branches/     Branch management
|   |   |-- products/     Product catalog
|   |   |-- inventory/    Stock management
|   |   |-- sales/        Transaction processing
|   |   |-- invoices/     Invoice generation
|   |   |-- returns/      Return workflow
|   |   |-- expenses/     Expense tracking
|   |   |-- transfers/    Inter-branch transfers
|   |   |-- notifications/Central notification hub
|   |   |-- audit-logs/   Activity tracking
|   |   |-- reports/      Analytics engine
|   |   |-- devices/      Device fingerprinting
|   |   |-- customers/    Customer management
|   |   |-- settings/     System configuration
|   |   |-- activity-feed/Real-time activity stream
|   |   |-- prisma/       Database ORM
|   |-- prisma/
|   |   |-- schema.prisma Database schema definition
|   |   |-- seed.ts       Default data seeding
|
|-- frontend/         React SPA
|   |-- src/
|   |   |-- pages/        Route-level components
|   |   |-- components/   Reusable UI components
|   |   |-- api/          API client configuration
|   |   |-- store/        State management (Zustand)
|   |   |-- types/        TypeScript type definitions
|   |   |-- lib/          Utility functions
```

---

## Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| NestJS | Enterprise-grade Node.js framework |
| Prisma ORM | Type-safe database access |
| PostgreSQL | Primary relational database |
| JWT | Stateless authentication |
| Nodemailer | Email delivery for device auth |
| Swagger | API documentation |

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18 | UI library |
| TypeScript | Type safety |
| Vite | Build tooling |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Component primitives |
| TanStack Query | Server state management |
| Zustand | Client state management |
| Recharts | Data visualization |
| React Router | Client-side routing |

---

## Prerequisites

- **Node.js** >= 18.0.0
- **PostgreSQL** >= 14.0
- **npm** or **yarn**

---

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/njugush-pos.git
cd njugush-pos
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Database Connection
DATABASE_URL="postgresql://username:password@localhost:5432/njugush_pos?schema=public"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="24h"

# Server Configuration
PORT=3000
FRONTEND_URL="http://localhost:5173"

# Email Service (Gmail SMTP)
EMAIL_USER="your-email@gmail.com"
EMAIL_PASS="your-app-password"

# Environment
NODE_ENV="development"
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL="http://localhost:3000/api"
```

---

## Database Setup

### 1. Generate Prisma Client

```bash
cd backend
npx prisma generate
```

### 2. Run Migrations

```bash
npx prisma migrate dev --name init
```

### 3. Seed Default Data

```bash
npx prisma db seed
```

This creates:
- 7 branches (Headquarters + 6 operational branches)
- 8 products across 4 categories (LPG Refills, Cylinders, Accessories)
- Default users with pre-configured credentials
- System settings and sample customers

### Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Super Admin (CEO) | ceo@njugush.co.ke | admin123 |
| Overall Manager | manager@njugush.co.ke | admin123 |
| Branch Manager | bm1@njugush.co.ke | admin123 |

*(Branch managers bm1 through bm6 are available for branches 1-6)*

---

## Running the Application

### Development Mode

Run both backend and frontend concurrently in separate terminals:

```bash
# Terminal 1 - Backend
cd backend
npm run start:dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

- **Backend API** runs at: http://localhost:3000
- **API Documentation** at: http://localhost:3000/api/docs
- **Frontend** runs at: http://localhost:5173

### Production Mode

```bash
# Build frontend
cd frontend
npm run build

# Build backend
cd ../backend
npm run build

# Start production server
npm run start:prod
```

---

## API Documentation

Interactive API documentation is available via Swagger UI when the backend is running:

```
http://localhost:3000/api/docs
```

The API is organized into the following modules:

| Module | Endpoints | Description |
|--------|-----------|-------------|
| Auth | `/api/auth/*` | Login, device verification, logout |
| Users | `/api/users/*` | CRUD operations for system users |
| Branches | `/api/branches/*` | Branch management and inventory |
| Products | `/api/products/*` | Product catalog and categories |
| Inventory | `/api/inventory/*` | Stock levels, restocking, adjustments |
| Sales | `/api/sales/*` | Transaction processing and history |
| Invoices | `/api/invoices/*` | Invoice creation and tracking |
| Returns | `/api/returns/*` | Return request workflow |
| Expenses | `/api/expenses/*` | Expense submission and approval |
| Transfers | `/api/transfers/*` | Inter-branch stock transfers |
| Notifications | `/api/notifications/*` | Notification management |
| Audit Logs | `/api/audit-logs/*` | Activity tracking |
| Reports | `/api/reports/*` | Analytics and statistics |
| Devices | `/api/devices/*` | Device authentication |
| Customers | `/api/customers/*` | Customer management |
| Settings | `/api/settings/*` | System configuration |
| Activity Feed | `/api/activity-feed/*` | Real-time activity stream |

---

## Deployment

### Deploy Backend to Render

1. Create a PostgreSQL database on Render
2. Create a new Web Service and connect this repository
3. Set environment variables in Render Dashboard
4. Build command: `cd backend && npm install && npm run build`
5. Start command: `cd backend && npm run start:prod`

See `render.yaml` for automated Blueprint deployment.

### Deploy Frontend to Vercel

1. Connect your GitHub repository to Vercel
2. Set root directory to `frontend/`
3. Add `VITE_API_URL` environment variable pointing to your Render backend
4. Deploy

See `vercel.json` for configuration.

---

## Project Structure

```
pos-system/
├── backend/                      # NestJS API
│   ├── prisma/
│   │   ├── schema.prisma         # Database schema (15+ tables)
│   │   └── seed.ts               # Default data
│   ├── src/
│   │   ├── auth/                 # JWT auth, device fingerprinting
│   │   ├── branches/             # Branch CRUD
│   │   ├── products/             # Product catalog
│   │   ├── inventory/            # Stock management
│   │   ├── sales/                # Transaction engine
│   │   ├── invoices/             # Invoice system
│   │   ├── returns/              # Return workflow
│   │   ├── expenses/             # Expense tracking
│   │   ├── transfers/            # Inter-branch transfers
│   │   ├── notifications/        # Notification hub
│   │   ├── audit-logs/           # Activity tracking
│   │   ├── reports/              # Analytics
│   │   ├── devices/              # Device authentication
│   │   ├── customers/            # Customer management
│   │   ├── settings/             # System config
│   │   └── activity-feed/        # Real-time feed
│   ├── .env.example
│   └── package.json
├── frontend/                     # React SPA
│   ├── src/
│   │   ├── pages/                # Page components
│   │   │   ├── admin/            # Admin pages
│   │   │   ├── manager/          # Manager pages
│   │   │   ├── branch/           # Branch manager pages
│   │   │   ├── shared/           # Shared pages
│   │   │   └── auth/             # Auth pages
│   │   ├── components/           # UI components
│   │   │   ├── ui/               # shadcn/ui primitives
│   │   │   └── layout/           # Layout components
│   │   ├── api/                  # API client
│   │   ├── store/                # Zustand stores
│   │   ├── types/                # TypeScript types
│   │   └── lib/                  # Utilities
│   └── package.json
├── render.yaml                   # Render deployment config
├── vercel.json                   # Vercel deployment config
└── README.md
```

---

## User Roles

| Role | Permissions |
|------|-------------|
| **Super Admin** | Full system access. User/branch management, device approvals, all reports, audit logs |
| **Overall Manager** | Multi-branch oversight. Inventory, customers, reports across all branches |
| **Branch Manager** | Single-branch operations. Sales, invoices, returns, expenses, transfers for their branch |

---

## Security Features

- **Device Fingerprinting** - Unique hardware identification prevents unauthorized access
- **6-Digit Email Verification** - One-time codes for new device authorization
- **JWT Authentication** - Stateless, secure token-based sessions
- **Role-Based Access Control** - Granular permissions per user role
- **Audit Trail** - Complete activity logging for compliance
- **Account Status Control** - Active/Inactive/Suspended states

---

## License

This project is proprietary software developed for **Njugush Enterprises**. All rights reserved.

---

<p align="center">
  <sub>Built with precision for Njugush Enterprises</sub>
</p>