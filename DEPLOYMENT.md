# Production deployment on Render

This project remains React + Flask + MySQL. The Render Blueprint in `render.yaml` creates a Gunicorn API service and a static React site; it does not create or migrate a MySQL database.

## Local API configuration

The development-only `frontend/.env.development` points the React app directly to `http://localhost:5000`. Vite's `/api` proxy uses the same Flask address as a fallback. This development file is not loaded by the production build. If you change it, restart the Vite server.

Start the backend from PowerShell:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python app.py
```

In another terminal, start the frontend:

```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173`. Check Flask at `http://localhost:5000/api/health` and the MySQL connection at `http://localhost:5000/api/database/health`.

## Before deploying

1. Choose a hosted MySQL 8 provider. Render Blueprints provision Render Postgres, not MySQL. Render documents a [self-managed MySQL private service](https://render.com/docs/deploy-mysql), which requires a persistent disk. An external managed MySQL service is usually simpler to import into from Windows.
2. Create an empty database named `video_course_hosting` and an application database user with permissions on that database. Keep the host, port, username, password, and any provider CA certificate private.
3. Back up the existing local database from PowerShell. This file contains user and course data, so keep it outside the repository:

   ```powershell
   & $env:ComSpec /c 'mysqldump -h 127.0.0.1 -P 3306 -u root -p --single-transaction --default-character-set=utf8mb4 video_course_hosting > "%USERPROFILE%\coursehub-backup.sql"'
   ```

4. Import the backup into the newly created, empty hosted database using your provider's MySQL client instructions. The dump can contain table recreation statements; do not import it over a database containing data you need to keep. For a provider that supports MySQL 8 TLS verification, the command has this form:

   ```powershell
   & $env:ComSpec /c 'mysql -h YOUR_DB_HOST -P 3306 -u YOUR_DB_USER -p --ssl-mode=VERIFY_IDENTITY --ssl-ca="C:\path\to\provider-ca.pem" video_course_hosting < "%USERPROFILE%\coursehub-backup.sql"'
   ```

   Replace the host, user, and CA path with the values from the provider. If the provider supplies a connection URL or a different TLS setup, follow its import instructions instead. Do not run `schema.sql` or the seed migrations on top of a full database dump.

5. Uploaded thumbnails, tutor video files, and generated certificate PDFs live under local `backend/uploads/`; they are not stored in MySQL or GitHub. To preserve them, transfer that folder securely to the API service's persistent disk at `/var/data/uploads`, retaining the `thumbnails`, `videos`, and `certificates` subfolders. Use Render's SSH/SCP or Magic Wormhole file-transfer guidance; do not commit uploads or database dumps.

If you don't already have hosted MySQL, Render's documented alternative is a **self-managed private MySQL service**: fork the official [`render-examples/mysql` repository](https://github.com/render-examples/mysql), then in Render click **New → Private Service**, connect that fork, select the Docker runtime, set `MYSQL_DATABASE=video_course_hosting`, `MYSQL_USER` to a non-root app user, and set strong `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` values in Render's Environment section. Under **Advanced**, attach a persistent disk mounted at `/var/lib/mysql` (Render's example uses 10 GB). Deploy it in Singapore, then use its internal hostname in the CourseHub API's `DB_HOST`; set `DB_PORT=3306`, `DB_NAME=video_course_hosting`, and the same app-user credentials. This self-managed database and its disk are paid resources; use the provider's backup and import instructions to move the local SQL dump into it.

## Deploy the Blueprint

1. Sign in at [dashboard.render.com](https://dashboard.render.com). See Render's [Blueprint setup guide](https://render.com/docs/infrastructure-as-code) if GitHub authorization is not already configured.
2. Click **New** → **Blueprint**.
3. Connect GitHub if prompted, then select `rakshithasj35-design/video-course-hosting` and branch `main`.
4. Keep the Blueprint path as `render.yaml`. Review the two services:
   - `coursehub-video-hosting-api` — Python/Gunicorn backend.
   - `coursehub-video-hosting-web` — Vite production build served as a static site.
5. When Render prompts for unsynchronized environment values, enter the hosted MySQL **host**, **username**, and **password**. Keep the port at `3306` and database name `video_course_hosting`. For a MySQL provider that requires a CA file, add the provider certificate as a backend **Environment → Secret File** named `mysql-ca.pem`, then add the backend environment variable `DB_SSL_CA=/etc/secrets/mysql-ca.pem`. Leave `DB_SSL_CA` unset only if the provider's instructions allow a connection without a CA file.
6. `JWT_SECRET` is generated by Render; do not paste it into GitHub or the frontend. The Blueprint references Render's own `RENDER_EXTERNAL_URL` values to configure `VITE_API_BASE_URL` and `FRONTEND_URL`; no guessed `onrender.com` URL is stored in the repository.
7. Review the price before clicking **Deploy Blueprint**. The API uses a **10 GB persistent disk** at `/var/data` so uploaded media and certificates survive restarts. Render [persistent disks](https://render.com/docs/disks) require a paid web service, are limited to one service instance, and affect deployment availability; adjust the disk size only after checking your actual storage needs and Render's current pricing.
8. Wait for both services to finish deploying. Render provides managed HTTPS for their `onrender.com` URLs. Copy the actual website and API URLs from their service pages in the Render dashboard.

If you add a custom frontend domain, replace the API's `FRONTEND_URL` value with that exact HTTPS origin and redeploy the API. If you add a custom API domain, set the frontend's `VITE_API_BASE_URL` to that HTTPS URL and rebuild/redeploy the static site.

## Environment values

| Service | Key | Value |
| --- | --- | --- |
| API | `DB_HOST` | Hostname from your MySQL provider; use its private hostname when available |
| API | `DB_PORT` | `3306` |
| API | `DB_USER` | Dedicated app database user |
| API | `DB_PASSWORD` | Password set at the provider; enter only in Render |
| API | `DB_NAME` | `video_course_hosting` |
| API | `DB_SSL_CA` | `/etc/secrets/mysql-ca.pem` when required by the provider |
| API | `JWT_SECRET` | Generated by Render |
| API | `FRONTEND_URL` | Render automatically references the frontend service's actual `RENDER_EXTERNAL_URL` |
| API | `FLASK_DEBUG` | `false` |
| API | `UPLOAD_ROOT` | `/var/data/uploads` |
| Frontend | `VITE_API_BASE_URL` | Render automatically references the API service's actual `RENDER_EXTERNAL_URL` |

`VITE_API_BASE_URL` is public browser configuration, not a secret. The frontend resolves API calls, uploaded media, and certificate links against this URL. Do not use `localhost` for either production URL.

## Verify the deployment

1. Open `<API URL>/api/health`; expect `status: healthy`.
2. Open `<API URL>/api/database/health`; expect `status: connected`.
3. Open the website URL shown in the Render dashboard, register or log in, explore domains, and check course thumbnails and video playback.
4. Test enrollment, an uploaded video/thumbnail, progress, and a certificate download. Confirm uploaded files remain available after an API redeploy.

The API's MySQL connection uses the database values above and verifies TLS certificates when `DB_SSL_CA` is set. Keep the database private or restrict its network access to the Render service whenever your provider supports it.
