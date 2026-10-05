\# FLOODGUARD Backend Demo Deployment



\## Jira Task



\- ID: CCF-209

\- Task: DEPLOY-02 - Deploy Backend API



\## Public Demo API



Base URL:



```text

https://floodguard-backend-demo.onrender.com

```



\## Deployment Configuration



\- Platform: Render Web Service

\- Service name: floodguard-backend-demo

\- Branch: develop

\- Root directory: backend

\- Build command: npm ci

\- Start command: npm start

\- Region: Singapore (Southeast Asia)

\- Plan: Free



\## Required Environment Variables



The deployed service is configured with these secrets in Render:



\- JWT\_SECRET

\- JWT\_EXPIRES\_IN

\- FIREBASE\_SERVICE\_ACCOUNT\_BASE64



Secret values are not stored in this repository.



\## Verification



Health check:



```text

GET /api/health

```



Result:



```json

{

&#x20; "success": true,

&#x20; "message": "FLOODGUARD API is running"

}

```



Firestore verification:



```text

GET /api/safe-locations

```



Result: successful response containing the sample safe location data.



\## Notes



\- The Free Render service may sleep after inactivity. Its first request after sleeping can take up to about 50 seconds.

\- Web and Mobile clients must use the Base URL above, not localhost.

\- Deployments are triggered from the develop branch.