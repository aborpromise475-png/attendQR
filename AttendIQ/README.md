# AttendIQ

## Run locally

Start the backend:

```bash
cd backend
npm install
npm start
```

Then open the frontend files in a browser. The app will talk to the API on the current site origin when hosted together, or to `http://localhost:3000` during local development.

## Deploy on Render

This repo includes a [Render Blueprint](render.yaml) for a single free web service.

1. Push the repo to GitHub.
2. In Render, create a new Blueprint deployment.
3. Connect the GitHub repo and let Render read `render.yaml`.
4. Create the service.

Render will build the `backend` folder, start the Node server, and serve the frontend from the same service.

### Environment variables

Render generates `ATTENDIQ_SECRET` automatically from the blueprint. If you want to set your own value, edit the service environment variables in Render after creation.

### Important note

The backend stores data in `backend/data/db.json`. On a free Render service, filesystem storage is not persistent across every redeploy or restart, so this is best for demos or testing rather than production attendance records.