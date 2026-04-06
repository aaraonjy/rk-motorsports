# RK Motorsports Platform

A full-stack ECU & TCU tuning platform built for modern file-based remapping workflows.

This platform allows customers to submit tuning requests, upload ECU/TCU files, and receive tuned files seamlessly — while providing admins with full control over orders, revisions, and file management.

---

## 🌐 Live Demo
https://rk-motorsports.vercel.app

---

## 🧱 Tech Stack

**Frontend**
- Next.js (App Router)
- TypeScript
- Tailwind CSS

**Backend**
- Next.js API Routes

**Database**
- PostgreSQL (Neon)

**ORM**
- Prisma

**Authentication**
- Custom session-based auth (cookie + HMAC)

**Storage**
- Vercel Blob (file uploads)

**Deployment**
- Vercel

---

## 👤 User Roles

### Customer
- Submit ECU / TCU tuning requests
- Upload stock ECU/TCU files
- View order status
- Download tuned files & revisions

### Admin
- View and manage all orders
- Upload tuned ECU / TCU files
- Upload revision files
- Manage customer requests

---

## ⚙️ Core Features

### 🔧 Custom ECU / TCU Tuning Workflow
- Vehicle selection (Brand → Model → Year → ECU/TCU)
- Stage selection (Stage 1 / 2 / 3 / Custom)
- Hardware modification selection
- Additional tuning options (Pop & Bang, Launch Control, etc.)
- Remarks for custom requests

### 📁 File Handling
- Upload stock ECU/TCU files
- Upload tuned files (Admin)
- Upload revision files
- Secure file storage via Vercel Blob

### 📊 Order Management
- Order tracking system
- Revision history
- Customer dashboard
- Admin dashboard

### 💳 Payment Integration
- Stripe / PayPal ready (configurable)

### 🔍 “Find a File” Feature
- Search available tuning maps based on vehicle selection

---
