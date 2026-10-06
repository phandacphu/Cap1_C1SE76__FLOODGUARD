\# Nearby Safe Locations API



\## Jira Task



CCF-68 — SAFE-BE-02: Get Nearby Safe Locations API



\## Endpoint



GET /api/safe-locations/nearby



Authentication: not required.



\## Query Parameters



| Parameter | Required | Description |

|---|---|---|

| latitude | Yes | Finite number between -90 and 90 |

| longitude | Yes | Finite number between -180 and 180 |

| radiusKm | No | Search radius in km; greater than 0 and at most 100; default 10 |

| type | No | shelter, school, hospital, community\_center, or other |



Unknown query parameters and repeated values for supported parameters

are rejected with HTTP 400.



\## Example Request



```text

GET /api/safe-locations/nearby?latitude=16.0544\&longitude=108.2022\&radiusKm=10\&type=community\_center

```



\## Successful Response



HTTP 200



```json

{

&#x20; "success": true,

&#x20; "message": "Nearby safe locations retrieved successfully",

&#x20; "data": {

&#x20;   "safeLocations": \[

&#x20;     {

&#x20;       "id": "ccf66-sample-safe-location-01",

&#x20;       "name": "Sample Community Shelter 01",

&#x20;       "address": "Hai Chau District, Da Nang",

&#x20;       "location": {

&#x20;         "latitude": 16.0544,

&#x20;         "longitude": 108.2022

&#x20;       },

&#x20;       "type": "community\_center",

&#x20;       "capacity": 300,

&#x20;       "capacityNote": "Temporary capacity for prototype testing",

&#x20;       "description": "Simulated evacuation location for FLOODGUARD testing",

&#x20;       "contactPhone": "02361234567",

&#x20;       "status": "active",

&#x20;       "services": \[

&#x20;         {

&#x20;           "id": "ccf66-sample-service-water",

&#x20;           "name": "drinking\_water",

&#x20;           "description": "Sample drinking water support",

&#x20;           "isAvailable": true

&#x20;         }

&#x20;       ],

&#x20;       "distanceKm": 0

&#x20;     }

&#x20;   ]

&#x20; }

}

```



The example contains simulated data.



\## Filtering and Ordering



\- Only locations with status active are returned.

\- Locations with missing or invalid coordinates are excluded.

\- When type is provided, only matching locations are returned.

\- Locations at or within radiusKm are included.

\- Results are sorted by distanceKm ascending.

\- Equal distances are ordered by location ID.

\- Services are included with their isAvailable values.

\- No matches returns HTTP 200 with safeLocations: \[].



\## Distance Meaning



distanceKm is the approximate straight-line distance along the

Earth's surface, calculated using the Haversine formula.



It is not a road distance, travel time, or confirmation that a route

is safe from flooding. Clients may round it for display.



An active location record does not confirm current occupancy,

available capacity, or real-time safety.



\## Errors



HTTP 400: missing coordinates, invalid query values, or unsupported

query parameters.



Example:



```json

{

&#x20; "success": false,

&#x20; "message": "Latitude and longitude query parameters are required"

}

```



HTTP 500: database or unexpected server failure.



```json

{

&#x20; "success": false,

&#x20; "message": "Internal server error"

}

```



\## Implementation Scope



The current implementation reads locations and their services,

then calculates distances and filters results in the backend.



This is intended for the small demo dataset. Larger datasets will

require geospatial querying and bounded result retrieval.



This endpoint does not call Google Maps or require a Maps API key.



\## Verification



```text

node tests/nearby-safe-locations.test.js

node tests/safe-location.controller.test.js

```