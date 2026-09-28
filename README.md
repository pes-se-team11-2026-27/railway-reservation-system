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

## Documents

| Document | Version | Location |
|---|---|---|
| Software Requirements Specification (SRS) | 1.0 | [docs/SRS](docs/SRS) |
| Software Architecture and Design Specification (SAD) | 1.0 | [docs/SAD](docs/SAD) |
| Software Test Plan (STP) | 1.0 | [docs/STP](docs/STP) |

## Diagrams

| Diagram | Location |
|---|---|
| Use case diagram 1, passenger channel | [diagrams/use-case](diagrams/use-case) |
| Use case diagram 2, counter, administration and on board | [diagrams/use-case](diagrams/use-case) |
| Component diagram | [diagrams/component](diagrams/component) |
| Sequence diagram, UC-03 Book a ticket | [diagrams/sequence](diagrams/sequence) |
| Sequence diagram, UC-04 Cancel a ticket | [diagrams/sequence](diagrams/sequence) |

Sequence diagram sources are included as PlantUML (`.puml`) and draw.io (`.drawio`) files next to the images.

## Planned technology stack

Node.js 20 with Express, PostgreSQL 15 through the pg driver, EJS templates, a Progressive Web App for the handheld, Docker Compose for the development environment, Jest, Supertest and k6 for testing, and GitHub Actions with SonarCloud for CI and static analysis. See SAD Section 3.6 for the reasoning.

## Status

Requirements, architecture and design, and test planning are complete. Implementation follows in the coming laboratory sessions.
