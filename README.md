# BatchBite
Preorder and Production Platform for Small Food Businesses – SWEN 360 

## Running BatchBite locally
1. **Backend:** `cd backend` → `npm install` → copy `data-template` to `data` → `node server.js` (http://localhost:3000)
2. **First Administrator (once per new data folder):** `cd frontend` → `node tools/create-admin.js ../backend/data`
3. **Frontend:** `cd frontend` → `node dev-server.js` → open http://localhost:5173

See `frontend/AUTH-MODULE.md` for how to connect new pages to login and roles, and `Documentation/Phase-2/BatchBite_Auth_Handover_and_Integration_Guide.docx` for the full handover.
