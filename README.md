# RK Motorsports - Full Importable MVP Repo

This repo is a full importable MVP for a custom ECU tuning portal.

## Included
- Next.js 15 + TypeScript + Tailwind
- Prisma + SQLite (easy local start)
- Custom login/register
- Customer dashboard
- Admin dashboard
- Product catalog
- Custom tune order form
- Local file upload for customer original files
- Download route for delivered files

## What still needs real production integration
- Payment gateway
- Email notifications
- Cloud storage like S3 / R2
- Admin completed-file upload UI
- Better validation and audit logs

## Quick start

```bash
npm install
copy .env.example .env
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```

## Demo accounts
- Admin: `admin@rkmotorsports.com` / `admin123`
- Customer: `customer@example.com` / `customer123`

## Notes
- Uploaded original files are stored in `public/uploads` in local mode.
- To use this as a true production system, switch to managed database + external object storage.
