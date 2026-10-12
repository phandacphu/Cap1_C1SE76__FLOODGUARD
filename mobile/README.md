# FloodGuard Mobile

## Google Maps API Key Configuration

Google Maps API key is not committed to Git.

### Setup

1. Open Google Cloud Console.

2. Enable `Maps SDK for Android`.

3. Create an API key.

4. Restrict the API key with:
   - Android package name: `com.example.floodguard`
   - SHA-1 fingerprint of the signing certificate.

5. Open:

   `mobile/local.properties`

6. Add:

   ```properties
   MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY