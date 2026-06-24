# Approval Workflow — Frontend Client UI

This directory contains the highly interactive, production-ready frontend client for the **Submission & Approval Workflow** application. The UI has been heavily customized to perfectly encapsulate the **Open Ownership** brand identity, providing an enterprise-grade user experience that feels both professional and premium.

Built as a Single Page Application (SPA), the client leverages modern web standards to deliver a sleek glassmorphism-inspired aesthetic alongside fully interactive SVG data visualization analytics.

## 🚀 Technology Stack

* **Framework:** React 19
* **Language:** TypeScript (`.tsx`) — *Fully migrated for strict type-safety, robust tooling, and enhanced developer experience.*
* **Build Engine:** Vite (Lightning-fast HMR and optimized production bundles)
* **Styling:** Vanilla CSS + Tailwind CSS v4
* **Theme Engine:** Dynamic CSS variables enabling live, seamless theming across the portal (Indigo, Emerald, Rose, Slate).
* **Security:** Leveraging the native Web Crypto API for secure, zero-dependency browser-side TOTP validation helpers.

## ✨ Key Enterprise Features

* **Server-Side Pagination & Search:** The Reviewer Evaluation Queue interacts flawlessly with backend pagination. It handles heavy tabular data by requesting specific chunks and performing real-time searches without clogging the browser's memory.
* **Server-Driven Analytics Dashboards:** High-performance dashboard visualizations rely on an isolated `/api/analytics` endpoint. All averages, sums, and status counts are computed instantly via raw PostgreSQL aggregates.
* **Zero-Dependency SVG Charting:** Complex responsive Donut Charts, Bar Charts, and Progress Rings are rendered cleanly via native math and SVGs—no bloated charting libraries were used, keeping bundle sizes impeccably small.
* **Strict State Management:** Dynamic locking ensures buttons and actions explicitly mirror the backend's strict workflow state machine, eliminating UI errors and illegal actions completely.

## 🛠️ Local Development

Ensure the backend Go API and PostgreSQL database are actively running (preferably via the root `docker-compose.yml`), as this frontend client relies heavily on the REST API to function.

To run the frontend locally in development mode:

```bash
# 1. Install all dependencies
npm install

# 2. Start the Vite development server with Hot Module Replacement
npm run dev
```

The application will be accessible at `http://localhost:3000` (or `http://localhost:5173` depending on local port availability).

## 📦 Production Build

To strictly type-check the codebase and build the optimized, minified static assets for deployment:

```bash
npm run build
```

This leveraging `tsc -b && vite build` ensures complete type safety across the entire application before bundling the outputs directly into the `dist/` directory.

## 📁 Key File Architecture

* `src/App.tsx`: The monolithic core of the application handling all SPA routing logic, global state management, strict role-based views, UI modals, and all dynamic SVG chart generation components.
* `src/index.css`: Contains the tailwind directives, global base styles, and the foundational CSS variables powering the real-time multi-theme engine.
* `src/vite-env.d.ts`: Exposes essential TypeScript definitions for Vite's internal `import.meta.env` utilities.
* `Dockerfile`: A heavily optimized multi-stage build configuration that compiles the React TypeScript app and serves it natively via a lightweight production Nginx container.
