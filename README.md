# Railway Reservation System

Software Engineering Laboratory Project, UE23CS341A, PES University
Team 11, Class 5A CSE

| Name | SRN |
|---|---|
| Abhigyan Dutta | PES2UG24CS019 |
| Akash Singh | PES2UG24CS042 |
| Aditya Alur | PES2UG24CS052 |
| Aditya G. Mule | PES2UG24CS031 |

## About

An online and counter based system for searching trains, reserving berths (with RAC, waitlist and Tatkal), paying for and cancelling tickets, preparing the reservation chart before departure, and checking tickets on board. Passengers, booking clerks, administrators and ticket examiners all work against one shared seat inventory.

## Running the project

You need Docker Desktop. From the project folder:

```
docker compose up --build
```

This starts PostgreSQL and the app, applies database migrations and loads demo data on first run. Open http://localhost:3000. The health check is at http://localhost:3000/health.

### Running without Docker

Needs Node.js 20 and a local PostgreSQL.

```
npm install
copy .env.example .env      (on Windows; use cp on Linux or macOS)
npm run migrate
npm run seed
npm run dev
```

## Tests

| Command | What it runs |
|---|---|
| `npm run lint` | ESLint over the whole project |
| `npm run test:unit` | Unit tests in `tests/unit`, no database needed |
| `npm run test:integration` | Integration tests in `tests/integration`, need PostgreSQL at `DATABASE_URL` |
| `npm run test:coverage` | Everything, with a coverage report in `coverage/` |

Integration tests wipe and rebuild the database they point at, so give them a separate database such as `rrs_test`.

## CI/CD

GitHub Actions runs on every push and pull request: install, lint, unit tests, integration tests against a PostgreSQL service container with coverage, then a Docker image build. See `.github/workflows/ci.yml`.

## Project layout

```
src/            application code (Express app, config, database pool, modules)
db/migrations/  SQL migrations, applied in file name order
db/seed/        demo and test data
tests/          unit and integration tests
docs/           SRS, SAD and STP
diagrams/       use case, component and sequence diagrams
```

## Documents

| Document | Version | Location |
|---|---|---|
| Software Requirements Specification (SRS) | 1.0 | [docs/SRS](docs/SRS) |
| Software Architecture and Design Specification (SAD) | 1.0 | [docs/SAD](docs/SAD) |
| Software Test Plan (STP) | 1.0 | [docs/STP](docs/STP) |

## Technology stack

Node.js 20, Express, PostgreSQL 15 through the pg driver, EJS templates, Docker Compose, Jest and Supertest for tests, k6 for load tests, GitHub Actions for CI. See SAD Section 3.6 for the reasoning.

## Sprint 1

Tracked as the **Sprint 1** milestone in GitHub Issues.
