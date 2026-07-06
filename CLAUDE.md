# Air Ticket Stock Management

## Tech Stack
- Next.js 15 + React 19 + TypeScript
- Tailwind CSS v4
- Supabase (PostgreSQL)
- lucide-react, date-fns, zod, xlsx, recharts

## Commands
```bash
npm run dev    # Start dev server
npm run build  # Build
npm run lint   # Lint
npx tsc --noEmit  # Type check
```

## Folder Structure
```
app/
├── dashboard/          # Dashboard ภาพรวม
├── tickets/            # All Tickets, Group, FIT, Land
├── tickets/[id]/       # View Detail (tabs)
├── tickets/add/        # Add Stock 5-step Wizard
├── import-export/      # Import Excel, Export Excel
├── settings/           # Airlines, Airports, Countries, Users, Templates
└── api/               # API routes (Supabase)

components/
├── layout/            # AppLayout, Sidebar, Header
├── ui/                # badge, button, card, input, table, modal, searchable-select
├── tickets/           # TicketTable, TicketFilter
└── wizard/            # WizardStepper, Step1-5

lib/
├── supabase.ts        # Supabase client
└── utils.ts           # formatDate, formatDateTime, calcTravelEnd, buildRouteText ฯลฯ

types/index.ts         # TypeScript interfaces ทั้งหมด
supabase/migrations/   # Database schema SQL
```

## Key Rules
- Primary color: #05a94f
- Date display: DD MMM YY (e.g., 25 Feb 26)
- DateTime display: DD MMM YY HH:mm (e.g., 25 Feb 26 18:00)
- Group/Ticket+Land: min 2 sectors (Outbound + Return)
- FIT One-way: min 1 sector
- Conditions belong to Stock only — PNR cannot link to Condition Templates directly
- Step 4 must show Fare, Tax, Total in main table
- All actions must log to activity_logs
