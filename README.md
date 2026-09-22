# 🚍 TransitHub - Smart Bus Ticketing & Express Mobility System

TransitHub is an enterprise-grade, inter-city passenger coach ticketing and fleet operations management platform. Engineered with an API-first architecture powered by **Laravel 12 (PHP 8.2+)** and a high-performance **React 19 + TypeScript + Vite + Tailwind CSS** Single-Page Application (SPA).

---

## 🔐 Demo Login Credentials & Portal Directory

All accounts are pre-configured with the default demo password:  
🔑 **Password for all accounts:** `TransitHub@2026!`

| Role | User Name | Email Address | Default Password | Portal URL | Primary Responsibilities |
|---|---|---|---|---|---|
| **System Administrator** | System Director Antigravity | `admin@transithub.com` | `TransitHub@2026!` | [`/admin`](http://localhost:5173/admin) | Enterprise command center, staff user provisioning, access control suspension/reactivation, cross-portal supervisor oversight. |
| **Finance Officer** | Treasurer Sola Ogunleye | `finance@transithub.com` | `TransitHub@2026!` | [`/finance`](http://localhost:5173/finance) | Treasury vault, daily/monthly revenue analytics, Paystack card & cash refund processing, POS till reconciliation, audit trails. |
| **Dispatcher** | Controller Emeka Vance | `dispatch@transithub.com` | `TransitHub@2026!` | [`/dispatch`](http://localhost:5173/dispatch) | Interstate flight deck, trip scheduling, coach/driver assignment & reassignment, roadworthiness toggling, highway corridors. |
| **Station Marshal** | Chief Inspector Yakubu | `marshal@transithub.com` | `TransitHub@2026!` | [`/marshal`](http://localhost:5173/marshal) | Turnstile gate scanner, passenger PNR barcode validation, departure bay staging, passenger manifests, terminal security alerts. |
| **POS Cashier** | Grace Effiong | `pos@transithub.com` | `TransitHub@2026!` | [`/pos`](http://localhost:5173/pos) | Counter walk-up ticket sales, interactive seat selection, cash receipt & thermal boarding pass printing, luggage cargo barcode tags, till handover. |
| **Captain / Driver** | Capt. Tunde Ojo | `driver@transithub.com` | `TransitHub@2026!` | [`/driver`](http://localhost:5173/driver) | Cockpit HUD, active route flight deck, passenger manifest roster with emergency contacts, pre-trip vehicle safety checklist, departure/arrival logging. |
| **Passenger / Client** | Amina Adebayo | `passenger@transithub.com` | `TransitHub@2026!` | [`/client`](http://localhost:5173/client) | Route search, interactive coach seat picker, Paystack checkout, QR boarding pass download, self-service cancellation and refund requests. |

---

## 🌟 Key Capabilities by Workspace

### 1. 🛡️ Executive Admin Command Center (`/admin`)
- **Fleet Oversight**: Live status of 14-seater standard coaches and 7-seater VIP luxury vans with 1-click operational/maintenance toggles.
- **Trip Scheduling & Dispatch Board**: Full departures directory with real-time seat occupancy bars and trip reassignment.
- **Staff Governance**: Provision and manage operational staff with role-based permissions and lockout safeguards.
- **Corridor Management**: Define highway routes, mileage distances, estimated travel hours, and base fares.

### 2. 💎 Finance Treasury Vault (`/finance`)
- **Financial Telemetry**: Monthly and daily revenue metrics, intake totals, and cash vs. card breakdown.
- **Interactive Financial Visualizations**: Daily cash flow charts, revenue trends, and corridor performance graphs.
- **Refund Management Desk**: Process card refunds (via Paystack API) and approve station cash refunds.
- **POS Till Handover Reconciliation**: Verify physical cash drawer handovers submitted by station counter staff.
- **Immutable Audit Trail**: Chronological log of all financial and administrative actions.

### 3. 📡 Dispatch HQ (`/dispatch`)
- **Interstate Flight Deck**: Radar view of all scheduled, en-route, and completed trips across Nigeria's major highway corridors.
- **Trip Scheduling Desk**: Publish new departures with automated coach and driver conflict prevention.
- **Fleet Reassignment**: Seamlessly reassign coaches and drivers in response to mechanical checks or driver shifts.
- **Fleet Telematics**: Manage vehicle roadworthiness inspections and staging bays.

### 4. 🛂 Station Marshal Gate Terminal (`/marshal`)
- **Turnstile Gate Scanner**: Instant PNR barcode validation with visual boarding approval/rejection feedback (`POST /operations/board`).
- **Terminal Bay Staging**: Monitor live passenger boarding progress for Bay 1, Bay 2, etc.
- **Official Manifest Sheet**: Comprehensive passenger roster with seat numbers, contact phone numbers, Next-of-Kin details, and 1-click printing for highway security checkpoints.
- **Terminal Security & PA System**: Contraband screening checklist, broadcast public address announcements, and emergency hotlines (Station Master, FRSC 122, Police 112).

### 5. 🎟️ POS Counter Terminal (`/pos`)
- **Walk-in Cash Ticketing Desk**: Interactive coach seat map (14-seater HiAce & 7-seater Sienna VIP), passenger details entry, cash receipt validation, and instant thermal boarding pass generation.
- **Luggage Tag Station**: Enter passenger PNR and bag count to print serialized barcode luggage claim tags for cargo hold security.
- **Ticket Lookup & Reprint**: Fast PNR lookup for ticket verification and boarding pass reissue.
- **Shift Drawer Reconciliation**: Count physical cash and submit reconciliation reports directly to the Treasury Vault (`POST /finance/handover`).

### 6. 🧭 Driver Cockpit & Flight HUD (`/driver`)
- **Mission Cockpit**: Real-time corridor telemetry, departure and arrival times in West Africa Time (WAT), and passenger load indicators.
- **Trip Status Progression**: Drivers can mark journeys as `Departed` upon terminal exit and `Completed` upon destination arrival.
- **Passenger Roster**: Verified passenger list with direct click-to-call links and Next-of-Kin emergency contacts.
- **Pre-Trip Safety Inspection**: 9-point roadworthiness inspection checklist (tires, fluids, brakes, lights, fire extinguisher, first aid, triangles, AC, seatbelts) with dynamic readiness percentage scoring.
- **Dispatch Comms**: Terminal radio channels and 24/7 roadside assistance hotlines.

### 7. 👤 Passenger Experience (`/` & `/client`)
- **Interactive Trip Search**: Filter by origin, destination, date, and preferred vehicle class.
- **Real-Time Seat Selection**: Live seat layout with optimistic locking to prevent double-booking.
- **Secure Payments**: Integrated with Paystack (Card, USSD, Bank Transfer).
- **Digital QR Boarding Passes**: Instant mobile pass generation with quick download and print options.
- **Self-Service Ticket Management**: Lookup bookings by PNR, initiate self-service cancellations, and track refund eligibility.
- **AI Travel Assistant**: Built-in interactive assistant for quick terminal and route inquiries.

---

## 🏗️ Architecture & Technology Stack

### Backend
- **Framework**: Laravel 12 (PHP 8.2+)
- **Database**: SQLite (Development/Testing) / MySQL 8.0+ (Production)
- **Authentication**: Bearer Token Session Management with secure HTTP-only cookies and role-based middleware (`role:admin,finance,dispatch,marshal,pos,driver,passenger`)
- **Payments**: Paystack API (Card tokenization, payment verification, and automated refund endpoints)
- **Security**: Strict rate limiting (`throttle:auth`, `throttle:api`), anti-tamper server-side fare resolution, atomic database transaction locks (`lockForUpdate`), and CSRF/CORS protection.

### Frontend
- **Framework**: React 19 + TypeScript (Strict Mode)
- **Build Tool**: Vite 8
- **Styling**: Tailwind CSS with custom design system tokens, responsive desktop sidebars, and mobile slide-over drawers.
- **Icons**: Lucide React
- **Routing**: React Router 7 with role-protected route guards (`<Protected role={...} />`)

---

## 📁 Repository Structure

```
practice/
├── backend/                       # Laravel 12 API & Core Application Server
│   ├── app/
│   │   ├── Http/Controllers/      # Auth, Booking, Pos, Dispatch, Operations, Finance, Payment, Ai
│   │   ├── Models/               # User, Route, Bus, Trip, Ticket, Terminal, AuditLog
│   │   ├── Notifications/        # TicketConfirmedNotification, FrontendResetPassword
│   │   └── Services/             # BookingService (concurrency locking), PaymentService (Paystack)
│   ├── database/
│   │   ├── migrations/           # Transactional schemas & role constraints
│   │   └── seeders/              # DatabaseSeeder with demo roles & routes
│   ├── routes/
│   │   └── api.php               # Protected REST API endpoints
│   └── tests/                    # Feature & Unit automated test suites (33 tests, 164 assertions)
├── frontend/                      # React 19 + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/           # Navbar, Footer, TicketCard, SearchBooking, QrCode, AiAssistant
│   │   ├── context/              # AuthContext, ToastContext
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx   # Public booking engine & marketing portal
│   │   │   ├── LoginPage.tsx     # Authentication & quick role login
│   │   │   ├── RegisterPage.tsx  # Passenger registration
│   │   │   ├── PasswordPage.tsx  # Password recovery & reset
│   │   │   ├── PassengerPortal.tsx # Passenger ticket manager (/client)
│   │   │   ├── AdminPortal.tsx   # Executive Admin control center (/admin)
│   │   │   ├── FinancePortal.tsx # Treasury & financial vault (/finance)
│   │   │   ├── DispatchPortal.tsx # Dispatch operations flight deck (/dispatch)
│   │   │   ├── MarshalPortal.tsx # Gate scanner & manifest portal (/marshal)
│   │   │   ├── PosPortal.tsx     # Counter ticketing & baggage terminal (/pos)
│   │   │   └── DriverPortal.tsx  # Driver cockpit & inspection HUD (/driver)
│   │   ├── services/             # api.ts (Centralized Axios client & helpers)
│   │   └── types/                # TypeScript type definitions
│   ├── index.html
│   └── vite.config.ts
├── docs/                          # Comprehensive deployment & API runbooks
└── scripts/                       # Build & deployment scripts
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- PHP 8.2 or higher (with `sqlite3`, `pdo_sqlite`, `curl`, `mbstring`, `openssl` extensions enabled)
- Composer 2.x
- Node.js 20.x or higher & npm

### 1. Backend Setup
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --force
php artisan db:seed --force
php artisan test
```

### 2. Frontend Setup
```bash
cd ../frontend
npm install
npm run build
```

### 3. Launch Development Servers

**Option A: Automated Dev Server**
```bash
# Terminal 1: Backend API (runs on Apache/XAMPP or PHP built-in server)
cd backend
php artisan serve --port=8000

# Terminal 2: Frontend Vite Dev Server
cd frontend
npm run dev
```

The frontend SPA will be accessible at: **`http://localhost:5173`** (or `http://localhost:5175`).

---

## 🧪 Testing & Quality Assurance

Run the automated backend test suite:
```bash
cd backend
php artisan test
```
*Current test suite: **33 passed (164 assertions)** covering booking concurrency, double-booking prevention, role-based authorization, Paystack verification, and credential security.*

Run frontend TypeScript compilation & production bundling:
```bash
cd frontend
npm run build
```
*Build status: **0 errors**, strict TypeScript validation (`tsc -b && vite build`).*

---

## 📄 License & Credits

- **Copyright:** &copy; 2026 TransitHub Technologies Inc. All rights reserved.
- **Developed by:** [Kendat Tech](http://kisprojectslab.com)
