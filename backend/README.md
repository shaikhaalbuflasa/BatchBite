# BatchBite Backend

Backend API for BatchBite, a pickup-only bakery ordering and production management system.

## Technology

- Node.js
- Express.js
- JSON file-based storage
- Token-based authentication

## Project Structure

- `server.js` — Express API and business logic
- `storage.js` — JSON data storage
- `data-template/` — Empty database templates
- `data/` — Local database (not uploaded to GitHub)
- `docs/` — Backend and frontend integration documentation

## Installation

1. Install Node.js.
2. Clone this repository.
3. Open a terminal in the project folder.
4. Install dependencies:

   npm install

5. Initialize the local database:

   cp -R data-template data

6. Start the backend:

   node server.js

The backend runs at:

http://localhost:3000

## Authentication

Protected API endpoints require a Bearer token.

Example:

Authorization: Bearer YOUR_TOKEN

Users must log in using `POST /login` to receive a token.

## User Roles

- Customer
- BusinessOwner
- KitchenStaff
- Administrator

## Main Features

- Customer registration and login
- Product and batch management
- Customer orders and modifications
- Ingredient stock and recipe calculations
- Kitchen production tasks
- Order status tracking
- Customer notifications
- Pickup slot management
- Single-use QR pickup verification
- Business owner reports
- Role-based access control

## Important Notes

- This project currently uses JSON files rather than a database server.
- Payments are simulated; no real payment gateway is connected.
- Orders are for pickup only; delivery is not supported.
- The database templates contain no accounts or products.
- Each developer must create their own local test data.
- Never commit passwords, session tokens, or private customer data.

## Documentation

See the `docs/` folder for:

- Backend Development, Handover and Testing Report
- Frontend Integration and AI Handover Guide

## Testing

The main order-to-pickup workflow has been tested successfully, including:

1. Customer order creation
2. Ingredient consumption
3. Preparation status
4. Ready-for-pickup status
5. Customer notifications
6. QR pickup verification
7. QR reuse prevention

Cross-business ownership restrictions were also tested.

Additional integration and edge-case testing is recommended.
