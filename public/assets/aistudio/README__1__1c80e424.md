# Xpressit backend

A straightforward Node.js 22+, Express 5, and MongoDB API for anonymous text and voice experiences. Accounts use a pseudonymous username and a generated six-word passphrase; no email or real name is collected.

## Run locally

Dependencies are already installed in this workspace. For a fresh checkout:

```sh
npm ci
cp .env.example .env
```

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `.env` using your Cloudinary product environment's API credentials. You can find these in the [Cloudinary console](https://console.cloudinary.com/). `CLOUDINARY_FOLDER` defaults to `xpressit`. Keep the API secret on the backend; the mobile app only uploads through this API. Startup checks that the three credentials are present.

Start MongoDB locally, or use the included development container:

```sh
docker compose up -d
npm run dev
```

The API runs at `http://localhost:5000/api`. Check database connectivity at `http://localhost:5000/health`. If you already have MongoDB running, you can skip Docker. For MongoDB Atlas, set `MONGODB_URI` to your connection string in `.env`.

```sh
npm start              # Run without watching files
npm run seed           # Add three sample stories and a demo account
npm test               # Run unit and MongoDB integration tests
npm run test:unit      # No database or network sockets required
npm run test:integration
```

The seed command prints the demo account's generated passphrase once. It does not overwrite existing accounts. Integration tests create and remove a separate temporary MongoDB database and mock Cloudinary, so they need no Cloudinary credentials and create no paid assets. They use `/usr/bin/mongod` if installed; otherwise `mongodb-memory-server` downloads a MongoDB binary. You can set `MONGOMS_SYSTEM_BINARY` to your own binary path. Unit tests exercise signed Cloudinary requests and the upload/download routes with mocked provider responses, without network access.

## Deploy on Render

Use `npm ci` as the build command and `npm start` as the start command. In your Render service's **Environment** settings, set `NODE_ENV=production`, `MONGODB_URI` to the complete MongoDB Atlas connection string, and your three Cloudinary credentials. Render supplies `PORT` automatically; the server listens on that port. Hosted deployments require an explicit `MONGODB_URI` instead of falling back to local MongoDB.

The start command does not require a `.env` file. `dotenv` loads it when present for local development; on Render the app uses the environment variables configured in the dashboard. Keep `.env` out of version control.

For MongoDB Atlas, use an Atlas **database user** and allow the Render service's outbound IP ranges in Atlas **Network Access**. Render shows these under the service's **Connect → Outbound** information. Ensure the cluster is running and URL-encode any special characters in the database password. After changing Render variables, save and redeploy the service. Once it starts, `/health` returns `status: "ok"` and `database: "connected"`.

`MongooseServerSelectionError` means the driver could not select a reachable MongoDB server. Check the Render environment variable first, then Atlas network access and cluster availability. An authentication failure points to the database user/password or permissions. The startup log prints guidance without printing connection strings or credentials.

## Authentication flow

1. Register with a username. The response includes a session token, the six words, and `user.confirmed: false`.
2. Display the passphrase with a copy button and require the user to save it.
3. Send `savedPassphrase: true` to the confirmation endpoint using the registration token. Feed, creation, and settings endpoints become accessible.
4. Returning users log in with their username and passphrase. An unconfirmed user can log in and finish confirmation within the pending registration's 24-hour lifetime.

Usernames are case insensitive and contain 3–24 letters, numbers, or underscores. Passphrases are case insensitive, with repeated whitespace normalized. Six random words provide 84 bits of selection entropy and are hashed using scrypt with a unique salt. Neither plaintext passphrases nor bearer tokens are stored in MongoDB; only their hashes are stored.

Sessions expire after 30 days by default. Use the token in every authenticated request:

```http
Authorization: Bearer YOUR_TOKEN
```

Store the token in your mobile platform's secure storage. Registration, login, and passphrase responses use `Cache-Control: no-store`.

### Register and confirm

```sh
curl -X POST http://localhost:5000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"quiet_voice"}'

# Replace YOUR_TOKEN with the token from registration.
curl -X POST http://localhost:5000/api/auth/confirm \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"savedPassphrase":true}'
```

### Change a passphrase

Send the current passphrase to `POST /api/auth/passphrase`. Display and save the newly generated words, then send them to `POST /api/auth/passphrase/confirm` within 15 minutes. The current passphrase remains valid until confirmation. Confirmation revokes previous sessions and returns a replacement token. Session versions also invalidate a login that races with the change.

```json
{ "currentPassphrase": "your current six saved words here" }
```

Confirmation body:

```json
{ "savedPassphrase": true, "passphrase": "the newly generated six words here" }
```

There is no email-based recovery or endpoint to retrieve an existing passphrase. The saved passphrase is the account credential; if it is lost, the account cannot be recovered. Usernames are immutable in this version.

## API endpoints

All `/api` endpoints require a confirmed account except `/api/meta` and the authentication flow. Confirmation and logout require a session; passphrase changes also require a confirmed account.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Database readiness; returns 503 when disconnected |
| GET | `/api/meta` | Categories, reactions, limits, and brand text |
| POST | `/api/auth/register` | Generate a six-word passphrase and pending account |
| POST | `/api/auth/confirm` | Confirm the passphrase is saved |
| POST | `/api/auth/login` | Log in with username and passphrase |
| POST | `/api/auth/logout` | Revoke the current session |
| POST | `/api/auth/passphrase` | Prepare a new passphrase |
| POST | `/api/auth/passphrase/confirm` | Activate it and revoke previous sessions |
| GET | `/api/posts` | Paginated feed |
| POST | `/api/posts` | Publish text or voice |
| GET | `/api/posts/:postId` | Experience details and engagement counts |
| PUT | `/api/posts/:postId` | Replace your post using the full creation body |
| DELETE | `/api/posts/:postId` | Delete your post and related records |
| PUT | `/api/posts/:postId/reaction` | Set or change your one reaction |
| DELETE | `/api/posts/:postId/reaction` | Remove your reaction |
| GET | `/api/posts/:postId/comments` | Paginated comments |
| POST | `/api/posts/:postId/comments` | Add a comment |
| DELETE | `/api/posts/:postId/comments/:commentId` | Delete your own comment |
| POST | `/api/posts/:postId/report` | Report a post, once per user |
| POST | `/api/media` | Upload one file using multipart form data |
| GET | `/api/media/:mediaId` | Read media; supports byte ranges |
| DELETE | `/api/media/:mediaId` | Delete your upload if no posts use it |
| GET | `/api/users/me` | Account information and preferences |
| PATCH | `/api/users/me/settings` | Update selected preferences |
| GET | `/api/users/me/blocks` | List users you blocked |
| POST | `/api/users/me/blocks` | Block by `{ "userId": "..." }` |
| DELETE | `/api/users/me/blocks/:userId` | Unblock a user |
| GET | `/api/users/me/reports` | Your submitted reports |
| GET | `/api/users/me/notifications` | Paginated notifications and unread count |
| PATCH | `/api/users/me/notifications/:notificationId/read` | Mark your notification as read |

### Create a text experience

```sh
curl -X POST http://localhost:5000/api/posts \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"text","category":"wins","title":"A small win","content":"Today I finally asked for help.","attachments":[]}'
```

Title and evidence are optional. Text content is required. Categories: `life`, `relationships`, `work`, `family`, `mental-health`, `confessions`, `wins`, `other`.

### Upload voice or evidence

Upload first, then include the returned media ID in the post. The `kind` is `voice`, `image`, `video`, or `document`.

```sh
curl -X POST http://localhost:5000/api/media \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -F 'kind=voice' \
  -F 'file=@recording.m4a'
```

Supported formats are PNG, JPEG, GIF, WebP; MP4 and WebM; MP3, WAV, Ogg, WebM audio, and M4A/MP4 audio; and PDF documents. File signatures are checked against an allowlist. Documents in this version are PDFs; other document formats can be added later.

Files are stored in Cloudinary using its signed REST API. Images, video, and voice recordings use `authenticated` delivery; voice uses Cloudinary's `video` resource type. PDFs use `raw` resources with `private` delivery. The database stores Cloudinary asset identifiers and metadata. Local disk is used only for a temporary file during validation and transfer; the temporary directory is removed afterward. If saving the database record fails after an upload, the backend attempts to delete the unlinked Cloudinary asset.

An upload is private to its owner until it is attached to a visible post. The media response includes a relative URL such as `/api/media/123...`; resolve it against the API host and include the Bearer token when downloading or playing it. The backend checks visibility, generates a short-lived signed Cloudinary download request, and streams the response. Cloudinary URLs and credentials are not returned to the app. Byte-range requests and Cloudinary's range response headers are forwarded for playback. Mobile audio clients must support authenticated requests, including byte-range requests. Playback, recording, waveform rendering, and publishing previews belong in the mobile app. If Cloudinary blocks PDF delivery for your account, enable PDF delivery in its security settings.

Create the voice experience:

```json
{
  "mode": "voice",
  "category": "life",
  "content": "My story in my own words.",
  "voice": { "media": "VOICE_MEDIA_ID", "duration": 42 },
  "attachments": ["EVIDENCE_MEDIA_ID"]
}
```

The written description is optional. Duration is in seconds, provided by the recording client and constrained to 1–300. The server does not analyze the recording duration or transcode files. Uploads are limited to 20 MB each and posts to five evidence attachments. The voice recording is separate from those five attachments. Only your own uploads can be attached.

Deleting a post removes its reactions, comments, reports, and notifications. Uploaded files remain owned by the uploader until explicitly deleted, allowing reuse and avoiding deletion of media referenced by another post. `DELETE /api/media/:mediaId` deletes the Cloudinary asset with cache invalidation before removing its database record. A failed Cloudinary deletion preserves that record for retry.

Existing files from the previous local-storage version are not migrated automatically. Re-upload them to Cloudinary and replace their media references before removing old files; the API no longer serves local uploads. `UPLOAD_DIR` is no longer used.

### Feed and interactions

```http
GET /api/posts?feed=latest&page=1&limit=20
GET /api/posts?feed=trending&category=work&page=1&limit=20
GET /api/posts?feed=for-you&page=1&limit=20
```

`latest` sorts newest first. `for-you` uses the account's preferred categories and falls back to latest when none are selected. `trending` ranks all-time reactions plus twice the comments, with newer posts breaking ties. An explicit category filter overrides preferences. This version uses bounded page-based pagination: up to 50 items per page and 1,000 pages.

Reactions use `{ "type": "support" }`, `{ "type": "resonate" }`, or `{ "type": "love" }`. Comments use `{ "content": "Thank you for sharing." }`. Post responses include reaction counts, the current user's reaction, comment count, author username, media details, timestamps, and `isMine`.

Blocking hides experiences and interactions in both directions, including media, comments by blocked users, and notifications. Sharing can use the post ID or an app deep link; readers must log in to retrieve the experience.

Report reasons: `harassment`, `hate`, `personal-information`, `spam`, `other`. An optional `details` field accepts up to 1,000 characters. Reports are stored as `pending`; a moderation interface and review workflow are not included.

### Settings

Partial updates preserve other preferences:

```json
{
  "theme": "dark",
  "notifications": { "reactions": true, "comments": true },
  "categories": ["life", "wins"]
}
```

Theme values: `system`, `light`, `dark`. Notifications are stored in-app when another user reacts or comments; delivery through APNs/FCM is not included. Repeated reaction requests do not create repeated notifications.

## Responses

Successful requests return `{ "data": ... }`; list endpoints include `pagination`:

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "hasMore": false }
}
```

Errors use a consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the request fields.",
    "details": [{ "field": "content", "message": "..." }]
  }
}
```

Empty lists return 200; deletes and logout return 204. Common errors are 400 for invalid input, 401 for missing/expired sessions, 403 for permissions, 404 for unavailable resources, 409 for conflicts, 413 for oversized uploads, 415 for unsupported files, and 429 for rate limits. Authentication is limited to 20 requests per IP per 15 minutes; the general API limit is 500. All browser origins are allowed and preflight requests are handled automatically, so AI Studio and multiple web/mobile clients need no origin configuration. Send the Bearer token for authenticated endpoints; cookie credentials are not required. Media range headers are exposed to browser clients.

## Project layout and deployment scope

`src/models.js` defines MongoDB collections and indexes. `src/routes/` handles authentication, posts, media, and account preferences. `src/lib/` contains hashing, validation, media inspection, post serialization, and signed Cloudinary requests. `src/server.js` checks Cloudinary configuration, connects MongoDB, initializes indexes, and handles graceful shutdown.

This is a backend foundation for the brief. Screens, themes, onboarding, recording controls, and offline states are implemented by the mobile client. Cloudinary provides shared media storage; feed ranking is simple, and rate limits use process memory. A multi-instance deployment needs shared rate limits and a moderation workflow. Configure HTTPS at the hosting layer and only enable `TRUST_PROXY=1` behind one trusted reverse proxy. The included MongoDB container is for local development.

Pseudonymous usernames conceal real account identities. The API does not explicitly anonymize voice or evidence or remove identifying information from those files. Cloudinary may process media according to its upload behavior and account configuration.
