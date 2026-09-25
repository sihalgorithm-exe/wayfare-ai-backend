# Wayfare AI Planner Backend

This repository contains the backend service for Wayfare's AI assisted trip planning module.

It provides the API used by the AI planning frontend and handles communication with the Gemini model.

## Highlights

- AI assisted itinerary generation
- REST API for the AI planner
- Trip planning endpoint
- Hotel ranking support
- Separate service for AI related processing
- Node.js and Express based backend
- Gemini integration

## Overview

The AI service is one part of the larger Wayfare planning flow.

A trip is first checked by the deterministic feasibility engine. Once the trip is considered feasible, the AI service can use the trip information to generate a more detailed itinerary.

This backend sits between the AI planner frontend and the Gemini API.

It keeps AI related processing separate from the main Spring Boot backend, which handles the core tourism platform.

## Planning Flow

```text
Feasible Trip
      ↓
AI Planner Frontend
      ↓
AI Backend
      ↓
Gemini
      ↓
Generated Itinerary
      ↓
Frontend
```

##  Usage

The main planning endpoint is:

```text
/api/plan
```

The service also contains endpoints related to hotel ranking and trip operations.

## Installation

```bash
git clone https://github.com/sihalgorithm-exe/wayfare-ai-backend.git
cd wayfare-ai-backend
npm install
```

Create `.env` from `.env.example` and add the required configuration.

Start the server using the command defined in `package.json`.

## Environment Variables

API keys and other private values should be kept in environment variables.

Do not commit `.env` files or API keys to GitHub.

## Tech Stack

- Node.js
- Express
- JavaScript
- Gemini API

## Related Projects

- [Wayfare AI Frontend](https://github.com/sihalgorithm-exe/wayfare-ai-frontend)
- [Trip Feasibility](https://github.com/sihalgorithm-exe/trip-feasibility)
- [Wayfare Frontend](https://github.com/sihalgorithm-exe/sih-tourism-frontend)
- [Wayfare Backend](https://github.com/sihalgorithm-exe/sih-tourism-backend)


## About

Wayfare is being developed by the `Algorithm.exe` team as part of Smart India Hackathon.


