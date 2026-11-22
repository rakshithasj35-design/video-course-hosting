# Video Course Hosting Platform

React frontend and Flask backend.

## Structure

- `frontend/` - React application created with Vite
- `backend/` - Flask REST API
- `backend/schema.sql` - Initial MySQL table definitions
- `backend/migrations/001_catalog_and_contact.sql` - Safe additive migration for existing databases
- `backend/migrations/002_youtube_courses.sql` - Adds YouTube course metadata and seeds the three freeCodeCamp courses
- `backend/migrations/003_course_domains.sql` - Adds domain relationships and seeds five more YouTube courses without duplicating existing courses
- `backend/migrations/004_youtube_course_catalog.sql` - Adds verified YouTube courses to reach eight courses in every domain and fills the legacy General course video
- `backend/.env.example` - Environment variable template

## Initial setup

1. Install MySQL 8.
2. Copy `backend/.env.example` to `backend/.env` and set database credentials.
3. For a new database, import `backend/schema.sql`.
4. For an existing installation, apply the additive migrations in order without dropping data:
   `Get-Content backend\migrations\001_catalog_and_contact.sql -Raw | mysql -u root -p video_course_hosting`
   `Get-Content backend\migrations\002_youtube_courses.sql -Raw | mysql -u root -p video_course_hosting`
   `Get-Content backend\migrations\003_course_domains.sql -Raw | mysql -u root -p video_course_hosting`
   `Get-Content backend\migrations\004_youtube_course_catalog.sql -Raw | mysql -u root -p video_course_hosting`
   Migration 002 uses the existing administrator account as the owning account for the curated YouTube courses; it does not create or alter user accounts.
   Migration 003 assigns the pre-existing Modern Web Development course to General so the Technology domain contains exactly the three original technology courses.
   Migration 004 is additive and idempotent. It keeps existing records, skips any YouTube ID already in the catalog, and assigns a full-stack YouTube lesson to the existing General-domain Modern Web Development course.
5. Install backend dependencies:
   `cd backend && py -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt`
6. Start Flask: `python app.py`
7. Install and start frontend:
   `cd frontend && npm install && npm run dev`

Open `http://localhost:5173`. Vite forwards `/api` requests to Flask on port 5000.

## Accounts

Register student and tutor accounts through the application. Admin accounts must be provisioned securely in MySQL; this repository does not publish demo passwords.

Set a unique, random `JWT_SECRET` in `backend/.env` before starting Flask. The backend refuses to start with the example placeholder.

## Run locally

Terminal 1:

```powershell
cd backend
.\.venv\Scripts\python.exe app.py
```

Terminal 2:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`.
