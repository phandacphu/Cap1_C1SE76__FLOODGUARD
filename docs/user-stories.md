# UC-SOS-01 - Send SOS Request

## 1. Use Case Information

| Field | Description |
|---|---|
| Use Case ID | UC-SOS-01 |
| Use Case Name | Send SOS Request |
| Primary Actor | Citizen / Resident |
| Goal | Allow a Citizen to send an emergency rescue request with GPS location and emergency information. |
| Priority | High |

## 2. Description

The Citizen uses the FLOODGUARD mobile application to send an SOS request during a flood emergency.

The SOS request contains the Citizen's current location and emergency information so that Rescue Staff can view, prioritize, and process the rescue request.

## 3. Trigger

The Citizen selects the SOS function in the FLOODGUARD mobile application.

## 4. Preconditions

1. The Citizen has a valid FLOODGUARD account.
2. The Citizen is logged in to the mobile application.
3. The mobile application has permission to access the device location, or the Citizen can grant permission when requested.
4. The device can obtain GPS/location information.
5. Internet connectivity is available for the normal SOS submission flow.
6. The FLOODGUARD backend service is available.

## 5. Main Flow

1. The Citizen opens the SOS function.
2. The mobile application checks location permission.
3. The application obtains the Citizen's current GPS coordinates.
4. The system displays the SOS form.
5. The Citizen enters:
   - Number of people needing assistance
   - Emergency level
   - Notes / description
6. The system automatically includes:
   - Citizen ID
   - Latitude
   - Longitude
   - Current time
7. The Citizen reviews the information.
8. The Citizen selects "Send SOS".
9. The mobile application sends the SOS request to the Backend REST API.
10. The Backend validates the request data.
11. The Backend creates a new rescue request.
12. The rescue request is stored in Firebase Firestore.
13. The system creates the initial rescue status history.
14. The initial SOS status is set to `Submitted`.
15. The Backend returns a successful response.
16. The mobile application displays a success confirmation.
17. The SOS request becomes available on the Rescue Dashboard.

## 6. Alternative Flows

### AF-01 - Location Permission Not Yet Granted

1. The application detects that location permission has not been granted.
2. The application requests location permission.
3. The Citizen grants permission.
4. The system continues from Main Flow Step 3.

### AF-02 - Citizen Edits SOS Information

1. The Citizen enters SOS information.
2. Before submitting, the Citizen changes the number of people, emergency level, or notes.
3. The application updates the form.
4. The system continues from Main Flow Step 7.

## 7. Exception Flows

### EF-01 - Location Permission Denied

1. The Citizen denies location permission.
2. The application cannot automatically obtain the current GPS location.
3. The system informs the Citizen that location permission is required for GPS-based SOS submission.
4. The SOS request is not submitted through the normal flow.

### EF-02 - GPS Location Cannot Be Obtained

1. The application attempts to obtain the current location.
2. Location data is unavailable or invalid.
3. The application informs the Citizen.
4. The SOS request is not submitted until valid location information is available.

### EF-03 - Invalid SOS Information

1. The Citizen enters invalid or incomplete SOS information.
2. The system displays validation errors.
3. The Citizen corrects the information.
4. The system returns to the SOS form.

### EF-04 - Internet Connection Failure

1. The Citizen selects "Send SOS".
2. The mobile application cannot connect to the Backend API.
3. The system informs the Citizen that the request could not be submitted.
4. The system does not display a successful SOS status.

### EF-05 - Backend Failure

1. The Backend receives the SOS request.
2. The Backend cannot process or store the request.
3. The Backend returns an error response.
4. The mobile application displays an error message.
5. The request is not considered successfully submitted.

## 8. Postconditions

### Success

1. A new SOS request exists in Firestore.
2. The request has the initial status `Submitted`.
3. Initial status history has been created.
4. The request is available to Rescue Staff.
5. The Citizen can view the request status.

### Failure

1. No successful SOS request is created.
2. The Citizen is informed that submission failed.

## 9. Business Rules

1. Each SOS request must be associated with a Citizen account.
2. Each SOS request must include location information.
3. Each SOS request must include the number of people needing assistance.
4. Each SOS request must include an emergency level.
5. Notes are optional unless later changed by project requirements.
6. The initial SOS status is `Submitted`.
7. Status changes must be recorded in rescue-request status history.
8. The system must not display a successful submission message unless the Backend confirms that the request has been stored successfully.
9. Rescue Staff are responsible for reviewing and processing submitted SOS requests.

## 10. Related Use Cases

- View SOS Status
- View SOS History
- View SOS Details
- Accept Rescue Request
- Update Rescue Status