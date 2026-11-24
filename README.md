# SmartStay - PG & Hostel Management (MongoDB version)

PG discovery on a free map (Leaflet + OpenStreetMap) for the public, plus one back office for properties, tenants, rooms, rent, employees, attendance, leave and payroll.
**React website + Express API + MongoDB.** Same screens, same features and same numbers as the MySQL version; built for easy deployment.

```
smartstay/
  backend/    Express API + MongoDB (src/models.js, src/rules.js, src/routes, src/seed.js, tests/)
  frontend/   React + Vite (public map, admin/HR area, employee area)
  docs/       MONGODB_DESIGN.md  TEST_RESULTS.md
  DEPLOY.md   step-by-step free deployment (Atlas + Render)
  render.yaml one-click Render config
```

## Run on your laptop
Needs **Node 18+** and a MongoDB: the easiest is a free **MongoDB Atlas** cluster (see DEPLOY.md, steps 1-2). Or install MongoDB locally.

```
cd backend
copy .env.example .env        (Mac/Linux: cp .env.example .env)
```
Edit `.env`: set `MONGODB_URI` (Atlas string, or `mongodb://127.0.0.1:27017/smartstay` for a local MongoDB). Then:
```
npm install
npm run seed                  # loads sample data (erases the database first)
npm start
```
In a second terminal:
```
cd frontend
npm install
npm run build
```
Open **http://localhost:5000**.

| Login | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Admin/HR |
| `emp1` ... `emp12` | `Emp@1234` | Employee (own attendance, leave, salary slips only) |

Tests (database seeded first): `cd backend && npm test`  (72 tests; writes `docs/TEST_RESULTS.md`).
Local MongoDB with transactions: start it as a replica set, e.g. `mongod --replSet rs0`, run `rs.initiate()` once, and use `?replicaSet=rs0` in the URI.

## Deploy
Follow **DEPLOY.md** (about 15 minutes, free).

## Salary rules
Working days = Mon-Sat. Per-day pay = basic / working days. Days with no attendance and no approved leave are deducted; approved leave is paid; every 3 late marks (check-in after 09:15) cost one day. Tax = progressive slabs from the `tax_slab` collection on annualised earned salary. Months must be finished before payroll runs, and all slips of a run are saved in one transaction.

## Public site
Search by name/area/city, room type, budget and free beds; prices show on the map pins; click a PG for details; **Enquire** sends a message; tenants can report an issue with their registered phone number.
