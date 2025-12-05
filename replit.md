# Overview

LienStream is a medical lien automation platform that scrapes, processes, and manages liens from county recorder websites (specifically Maricopa County). The system automatically discovers liens, downloads PDFs, syncs data to Airtable for CRM management, and triggers direct mail marketing campaigns. Built as a full-stack web application with automated scheduling and comprehensive monitoring capabilities. The system processes medical liens (HL document code) with typical daily yields of 50-100 liens depending on filing volume.

# User Preferences

Preferred communication style: Simple, everyday language.

## UI/UX Preferences
- Collapsible sidebar with subtle circular toggle button and arrow icon
- Dashboard organization: Status Cards → Automation Controls → Recent Activity → Configuration & Monitoring
- 12-hour time format with AM/PM selection
- Timezone restrictions to PT, CT, and ET only
- Visual section headers with color-coded indicators for better hierarchy
- Export Data function integrated within Recent Activity section (all data or date range export)
- View Logs function integrated within System Activity section (all logs or date-specific filtering)
- Removed standalone Quick Actions section for cleaner interface

# System Architecture

## Frontend Architecture
The client uses React with TypeScript in a single-page application (SPA) architecture. The UI is built with shadcn/ui components providing a consistent design system, styled with Tailwind CSS using CSS variables for theming. React Router (wouter) handles navigation, while TanStack Query manages server state and API communication. The application features a sidebar navigation layout with real-time dashboard monitoring.

## Backend Architecture
The server follows a REST API pattern using Express.js with TypeScript. The application uses a modular service architecture with separate services for web scraping (ScraperService), external integrations (AirtableService), task scheduling (SchedulerService), and centralized logging (Logger). All services are orchestrated through a unified storage abstraction layer that currently uses in-memory storage but can be easily swapped for database implementations.

## Data Storage Solutions
The system uses Drizzle ORM with PostgreSQL as the primary database. The schema defines four main entities: users (authentication), liens (core data), automationRuns (execution tracking), and systemLogs (audit trail). The current implementation includes an in-memory storage adapter for development, with the database configuration ready for production deployment via Neon Database.

## Automation & Scheduling
A cron-based scheduler runs daily automation workflows at 6:00 AM, with support for manual triggers via the web interface. The automation pipeline includes: web scraping with Puppeteer, data validation and filtering, Airtable synchronization, and comprehensive logging of each step's success/failure status.

## Authentication & Authorization
Basic user management is implemented through the users table, though the current system appears to operate without active authentication middleware. The schema supports username/password authentication that can be extended with session management or JWT tokens.

# External Dependencies

## Database Services
- **Neon Database**: PostgreSQL hosting service configured via DATABASE_URL environment variable
- **Drizzle ORM**: Database toolkit providing type-safe queries and schema migrations

## Web Scraping Infrastructure  
- **Puppeteer**: Headless Chrome automation for scraping Maricopa County recorder websites
  - **RESOLVED**: Fixed critical timeout error "Timed out after 30000 ms" by removing hardcoded Chrome path
  - **RESOLVED**: Fixed ES module "require is not defined" error by converting to ES6 imports
  - **RESOLVED** (Dec 5, 2025): Fixed PDF download URL format - county changed from `/UnOfficialDocs/pdf/{num}.pdf` to `/recdocdata/UnofficialPdfDocs.aspx?rec={num}&pg=1&cls=RecorderDocuments&suf=`
  - Dynamic Chrome detection with automatic path discovery
  - 60-second timeout with 3 retry attempts for browser launch  
  - Special configuration for Replit/container environments
  - Successfully launches browser and discovers liens (tested with 150+ liens found)
- **PDF Download**: Primary URL format is `UnofficialPdfDocs.aspx` endpoint (works for all documents including recent ones), with legacy `/UnOfficialDocs/pdf/` as fallback
- **Chromium**: System dependency installed for reliable browser automation
- **Node-cron**: Task scheduling for automated daily scraping runs at 1:00 AM ET

## External API Integrations
- **Airtable API**: CRM integration for lead management, requiring AIRTABLE_API_KEY and AIRTABLE_BASE_ID configuration
- **Data Enrichment Services**: Placeholder infrastructure for enhancing debtor contact information

## UI Framework & Styling
- **React**: Frontend framework with TypeScript support
- **shadcn/ui**: Component library built on Radix UI primitives
- **Tailwind CSS**: Utility-first styling with CSS custom properties
- **TanStack Query**: Server state management and caching
- **Wouter**: Lightweight React routing solution

## Development & Build Tools
- **Vite**: Frontend build tool with HMR and development server
- **ESBuild**: Backend bundling for production deployment
- **TypeScript**: Type system across the entire application stack
- **Replit Integration**: Development environment plugins and runtime error handling