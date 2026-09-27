\# Authentication Logout and Session Flow



\## Approach



FLOODGUARD uses stateless JWT authentication.



The backend does not store login sessions and does not maintain a token blacklist. A JWT remains technically valid until its expiration time.



\## Login Flow



1\. The client sends email and password to `POST /api/auth/login`.

2\. The backend validates the credentials and account status.

3\. The backend creates a signed JWT containing the user ID and role.

4\. The client stores the JWT securely.

5\. The client sends the JWT in the `Authorization` header for protected requests.



```text

Authorization: Bearer <token>