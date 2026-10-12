# I2I By AI — Adaptive AI Workspace

> **From business intent to actionable outcomes.**

I2I By AI is an AI-powered adaptive workspace designed to help business teams manage tasks, goals, client information, notifications, and operational insights through a unified interface.

Instead of navigating multiple static dashboards, users can describe their objectives in natural language. The system interprets their intent and organizes relevant workspace components to help them understand priorities, identify blockers, and determine the next steps.

Built for **HackWave 3.0**, I2I By AI explores how AI can make business software more adaptive, contextual, and action-oriented.

---

## Table of Contents

- [Problem Statement](#problem-statement)
- [Our Solution](#our-solution)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API and Data Flow](#api-and-data-flow)
- [Current Limitations](#current-limitations)
- [Future Scope](#future-scope)
- [Contributing](#contributing)
- [Team](#team)

## Problem Statement

Modern business teams often depend on multiple tools to manage tasks, track goals, monitor performance, prepare client meetings, and coordinate daily operations.

Traditional dashboards are usually static and require users to manually search for relevant information, identify dependencies, and decide what to do next.

This creates several challenges:

- Fragmented business information.
- Limited visibility into task blockers and overdue work.
- Manual coordination between tasks, goals, and teams.
- Difficulty identifying the most important next action.
- Dashboards that do not adapt to the user's immediate objective.

## Our Solution

I2I By AI aims to bridge the gap between business intent and execution through an adaptive workspace.

Users describe what they want to accomplish, and the system generates a workspace plan containing relevant components, information, and suggested actions.

The platform combines natural-language interaction with task management, goal tracking, client intelligence, analytics, and proactive alerts.

**Our vision:** A workspace that adapts to the work instead of forcing users to adapt to the software.

## Key Features

### 1. Adaptive AI Workspace
- Accepts natural-language requests.
- Interprets user intent and proposes relevant workspace components.
- Supports workspace replacement and modification workflows.
- Uses a rule-based fallback for supported requests when AI generation fails.

### 2. Task Management
- Organizes tasks by owner, status, priority, and due date.
- Displays blockers and reasons for delays.
- Supports task search and task-oriented workflows.
- Helps users identify pending and overdue work.

### 3. Goal Tracking and Gap Radar
- Connects goals with existing project tasks.
- Displays task completion progress.
- Identifies potential risks and blocked work.
- Surfaces alerts that may require intervention.

### 4. AI-Powered Chat Assistant
- Provides a conversational interface for business workflows.
- Supports task-oriented prompts and contextual assistance.
- Helps users explore priorities, blockers, and next actions.

### 5. Notifications and Reminders
- Displays upcoming deadlines and overdue tasks.
- Provides in-app notification summaries.
- Includes configurable customer reminder workflows.
- Supports desktop alerts while the application is running, where enabled.

External reminder delivery depends on the required provider configuration.

### 6. Client Intelligence
- Presents client overviews and business health indicators.
- Organizes open issues, recent communications, and meeting information.
- Suggests relevant talking points and next actions.

### 7. Analytics and Usage Insights
- Presents key business metrics and activity trends.
- Highlights changes in user activity and operational performance.
- Helps users investigate potential causes and identify follow-up actions.

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React.js | Interactive user interface |
| Frontend tooling | Vite | Development server and production builds |
| UI | HTML5, CSS3, JavaScript | Layout, styling, and interactions |
| Backend | Node.js | Server-side JavaScript runtime |
| API framework | Express.js | HTTP endpoints and backend request handling |
| Database | MongoDB | Persistent business and application data, where configured |
| AI integration | LLM API | Intent interpretation and workspace planning |
| Fallback logic | JavaScript rules | Handles supported requests when AI generation is unavailable |
| Communication | REST APIs and JSON | Structured communication between frontend and backend |
| Version control | Git and GitHub | Source control and collaboration |

**Note:** The active AI provider and database configuration should match the actual backend implementation. Consult the environment configuration before selecting a provider or database for deployment.

## System Architecture

```text
                    USER
                      |
                      v
             React + Vite Frontend
                      |
                HTTP / JSON
                      |
                      v
              Express.js Backend
                      |
              Intent Processing
                      |
              +-------+-------+
              |               |
              v               v
          LLM API       Rule-Based Fallback
              |               |
              +-------+-------+
                      |
                      v
             Plan Validation
                      |
                      v
          Workspace Configuration
                      |
                      v
          Adaptive React Interface
                      |
                      v
           User Reviews / Acts
                      |
                      v
            Database Operations
                      |
                      v
                  MongoDB
```

The diagram represents the intended request flow. Actual database operations depend on the implemented route and persistence logic.

## How It Works

1. **User input:** The user describes an objective, such as preparing a client meeting or investigating overdue work.
2. **Request processing:** The frontend sends the request to the backend using an API call.
3. **Intent interpretation:** The backend invokes the configured AI planner or an available rule-based fallback.
4. **Plan generation:** The planning logic produces a structured workspace configuration.
5. **Validation:** The backend checks the generated result before returning it.
6. **Workspace rendering:** React displays the relevant components and information.
7. **Task execution:** The user reviews the workspace and performs supported actions.
8. **Persistence:** Implemented database operations save the relevant changes.

The application should distinguish AI-generated results from fallback results so users can understand how a plan was produced.

## Project Structure

The repository contains separate frontend and backend areas. The following illustrates their intended responsibilities; check the current repository for the exact file names.

```text
i2i-ai-HackWave-3/
├── client/                 # React + Vite frontend
│   ├── src/
│   │   ├── components/     # Reusable interface components
│   │   ├── pages/          # Workspace views
│   │   └── ...             # Application code
│   ├── package.json
│   └── vite.config.js
│
├── server/                 # Node.js + Express backend
│   ├── server.js           # Server and API routes
│   ├── llm.js              # AI planning integration
│   └── ...                 # Data and business logic
│
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm.
- Git.
- A MongoDB instance if the selected workflow requires persistent database access.
- Valid credentials for the AI provider configured in the backend.

### 1. Clone the repository

```bash
git clone https://github.com/KkDhote/i2i-ai-HackWave-3.git
cd i2i-ai-HackWave-3
```

### 2. Install backend dependencies

```bash
cd server
npm install
```

Configure the backend environment variables before starting the server.

### 3. Start the backend

Use the start script defined in `server/package.json`. If it defines a `start` script:

```bash
npm start
```

If it defines a development script instead, use the corresponding script, such as `npm run dev`.

Keep this terminal running.

### 4. Install frontend dependencies

Open a second terminal:

```bash
cd client
npm install
```

### 5. Start the frontend

```bash
npm run dev
```

Vite will print the local development URL in the terminal. Open that URL in your browser.

**Important:** The frontend API base URL, backend port, and start scripts must match your actual configuration. Do not assume that the commands or default ports above are configured identically in every version of the repository.

## Environment Variables

Create a local `.env` file in the backend directory using the variable names expected by your current server code.

Example template:

```env
PORT=5000
ANTHROPIC_API_KEY=your_api_key_here
MONGODB_URI=your_mongodb_connection_string
```

These are illustrative settings, not a guarantee that every variable is required or consumed by the current code.

- Use the actual port configured by the backend.
- Configure the AI key for the provider used by `server/llm.js`.
- Configure the MongoDB URI only if the active database implementation uses it.
- Add the frontend API URL variable if required by the Vite configuration.
- Never commit real API keys, passwords, or database credentials to GitHub.
- Add local environment files to `.gitignore`.

## API and Data Flow

The frontend and backend communicate using HTTP requests and JSON responses.

A typical planning request contains a natural-language intent and, when required, information about the current workspace.

Illustrative request:

```json
{
  "intent": "Prepare a client meeting",
  "client": "Bharat Logistics"
}
```

The backend processes the request and returns a structured result according to its implemented API contract.

JSON provides a standard way to represent request parameters, task records, workspace plans, and API responses. It is a data format, not a programming language or database.

Check the current route definitions before relying on any specific endpoint, request field, or response structure.

## Current Limitations

I2I By AI is a hackathon prototype and should not be treated as a production-ready enterprise system without further validation.

Areas requiring testing include:

- Reliability and correctness of AI-generated workspace plans.
- Consistency between dashboard metrics and underlying task data.
- Database persistence across all supported workflows.
- AI provider failures, invalid credentials, timeouts, and fallback behavior.
- Notification provider configuration and actual message delivery.
- Authentication, authorization, and client-level data isolation.
- Input validation, error handling, and automated test coverage.
- Responsive behavior across different screen sizes.

Some displayed business records may be demonstration or seed data. Demo metrics should not be interpreted as verified live business information.

## Future Scope

Potential future improvements include:

- More reliable intent classification and workspace planning.
- Evaluation metrics for workspace relevance and task completion.
- Better explanations for alerts and recommendations.
- Stronger task dependency and workflow automation.
- Authentication, role-based permissions, and team collaboration.
- Improved notification delivery and scheduling reliability.
- Comprehensive API, integration, and end-to-end testing.
- Deployment with monitoring, logging, and production security controls.

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Commit your changes with a descriptive message.
5. Open a pull request explaining the changes.

## Team

**Project:** I2I By AI  
**Event:** HackWave 3.0  
**Repository:** [KkDhote/i2i-ai-HackWave-3](https://github.com/KkDhote/i2i-ai-HackWave-3)

---

*I2I By AI — Turning business intent into actionable work.*
