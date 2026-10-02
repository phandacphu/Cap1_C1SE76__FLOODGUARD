\# Open-Meteo Weather and Flood Forecast API



\## Purpose



This endpoint provides rainfall forecasts and river discharge forecasts for a requested geographical location.



External data sources:



\- Open-Meteo Weather API

\- Open-Meteo Flood API

\- Global Flood Awareness System (GloFAS)



Mobile and Web clients must call the FLOODGUARD Backend. They must not call Open-Meteo directly.



\## Endpoint



```http

GET /api/flood-forecast

```



Authentication is not currently required.



\## Query Parameters



| Parameter | Type | Required | Validation |

|---|---|---:|---|

| `latitude` | number | Yes | From `-90` to `90` |

| `longitude` | number | Yes | From `-180` to `180` |



\## Example Request



```http

GET /api/flood-forecast?latitude=10.0452\&longitude=105.7469

```



Local development URL:



```text

http://localhost:5000/api/flood-forecast?latitude=10.0452\&longitude=105.7469

```



\## Success Response



Status:



```text

200 OK

```



Example:



```json

{

&#x20; "success": true,

&#x20; "message": "Weather and flood forecast retrieved successfully",

&#x20; "data": {

&#x20;   "weather": {

&#x20;     "source": "Open-Meteo Weather API",

&#x20;     "requestedLocation": {

&#x20;       "latitude": 10.0452,

&#x20;       "longitude": 105.7469

&#x20;     },

&#x20;     "resolvedLocation": {

&#x20;       "latitude": 10.05,

&#x20;       "longitude": 105.75,

&#x20;       "timezone": "Asia/Bangkok"

&#x20;     },

&#x20;     "current": {

&#x20;       "time": "2026-10-02T14:00",

&#x20;       "precipitation": 0,

&#x20;       "rain": 0,

&#x20;       "weatherCode": 3

&#x20;     },

&#x20;     "hourly": \[

&#x20;       {

&#x20;         "time": "2026-10-02T14:00",

&#x20;         "precipitationProbability": 20,

&#x20;         "precipitation": 0,

&#x20;         "rain": 0

&#x20;       }

&#x20;     ],

&#x20;     "units": {

&#x20;       "current": {},

&#x20;       "hourly": {}

&#x20;     },

&#x20;     "disclaimer": "Forecast data is provided for informational purposes and is not an official emergency warning."

&#x20;   },

&#x20;   "flood": {

&#x20;     "source": "Open-Meteo Flood API / GloFAS",

&#x20;     "requestedLocation": {

&#x20;       "latitude": 10.0452,

&#x20;       "longitude": 105.7469

&#x20;     },

&#x20;     "resolvedLocation": {

&#x20;       "latitude": 10.025002,

&#x20;       "longitude": 105.725006

&#x20;     },

&#x20;     "dataAvailable": true,

&#x20;     "message": null,

&#x20;     "daily": \[

&#x20;       {

&#x20;         "date": "2026-10-02",

&#x20;         "riverDischarge": 86.9,

&#x20;         "riverDischargeMax": 89.16

&#x20;       }

&#x20;     ],

&#x20;     "units": {

&#x20;       "river\_discharge": "m³/s",

&#x20;       "river\_discharge\_max": "m³/s"

&#x20;     },

&#x20;     "disclaimer": "Forecast data is provided for informational purposes and is not an official emergency warning."

&#x20;   }

&#x20; }

}

```



\## Location Without Modeled River Data



Weather data may be available while GloFAS river data is unavailable near the requested location.



The API still returns:



```text

200 OK

```



The flood object will contain:



```json

{

&#x20; "dataAvailable": false,

&#x20; "message": "No modeled river discharge data is available near this location",

&#x20; "daily": \[

&#x20;   {

&#x20;     "date": "2026-10-02",

&#x20;     "riverDischarge": null,

&#x20;     "riverDischargeMax": null

&#x20;   }

&#x20; ]

}

```



Mobile and Web must check `data.flood.dataAvailable` before displaying river discharge values.



They must not convert a `null` value to zero.



\## Error Responses



\### Missing Coordinates



Status:



```text

400 Bad Request

```



```json

{

&#x20; "success": false,

&#x20; "message": "Latitude and longitude query parameters are required"

}

```



\### Invalid Coordinates



Status:



```text

400 Bad Request

```



```json

{

&#x20; "success": false,

&#x20; "message": "Latitude must be a number between -90 and 90"

}

```



\### External Service Unavailable



Status:



```text

502 Bad Gateway

```



```json

{

&#x20; "success": false,

&#x20; "message": "External forecast service is unavailable"

}

```



\### External Service Timeout



Status:



```text

504 Gateway Timeout

```



```json

{

&#x20; "success": false,

&#x20; "message": "External forecast service timed out"

}

```



\## Important Limitations



\- Weather and river discharge values are forecasts, not guaranteed observations.

\- GloFAS does not provide modeled river data for every location.

\- The Flood API selects a nearby modeled river grid point.

\- This endpoint does not provide an official flooded-area polygon.

\- Existing sample flood-area polygons must continue to be identified as simulated data.

\- The forecast must not be presented as an official emergency warning.

\- Official alerts should be integrated separately from an authoritative alert provider.



\## Client Display Rules



Mobile and Web should display:



\- Data source

\- Last forecast time or forecast date

\- Measurement units

\- Disclaimer

\- A clear unavailable state when `dataAvailable` is `false`