# FLOODGUARD Demo Environment

## Jira Task

- ID: CCF-208
- Task: DEPLOY-01 - Prepare Demo Environment
- Type: Shared demo/test environment

## Purpose

The demo environment provides one shared Backend API for Web, Mobile
and QA members. Demo configuration is separated from local
configuration, and secrets are never stored in Git.

## Hosting Platform

Render Web Service is selected for the Backend demo environment.

Render provides:

- Node.js and Express support.
- GitHub repository integration.
- HTTPS service URL.
- Protected environment variables.
- Automatic deployment support.

The actual Backend deployment is handled in CCF-209.

## Local Environment

Local Backend uses:

```text
backend/.env
backend/serviceAccountKey.json
```

Local Base URL:

```text
http://localhost:5000
```

Android Emulator Base URL:

```text
http://10.0.2.2:5000
```

## Demo Environment

The deployed Backend uses protected environment variables and does
not require a committed `serviceAccountKey.json` file.

Required variables:

```text
JWT_SECRET
JWT_EXPIRES_IN
FIREBASE_SERVICE_ACCOUNT_BASE64
```

`PORT` is provided by the hosting platform.

The real values must only be stored in Render.

## Security Rules

Never commit or publish:

```text
.env
serviceAccountKey.json
JWT_SECRET
FIREBASE_SERVICE_ACCOUNT_BASE64
private keys
API keys
test account passwords
JWT access tokens
```

## Health Check

After deployment:

```http
GET /api/health
```

Expected result:

```text
200 OK
```

## Follow-up Tasks

- CCF-209: Deploy Backend API
- CCF-212: Configure Production Environment Variables
- CCF-213: Verify Deployment