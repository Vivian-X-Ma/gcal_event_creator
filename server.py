from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
import dateparser
import os
import logging

logging.basicConfig(level=logging.INFO)

# ----------------------------
# Configuration
# ----------------------------
app = FastAPI()

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
CLIENT_SECRETS_FILE = "credentials.json"
TOKEN_FILE = "token.json"

# Allow HTTP for localhost (development only)
os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"

# ----------------------------
# OAuth Routes
# ----------------------------
@app.get("/login")
async def login():
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        redirect_uri="http://localhost:5000/oauth2callback"
    )
    auth_url, state = flow.authorization_url(
        access_type="offline",      # request refresh token
        include_granted_scopes="true",
        prompt="consent"            # force refresh_token
    )
    return RedirectResponse(auth_url)

@app.get("/oauth2callback")
async def oauth2callback(request: Request):
    state = request.query_params.get("state")
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES,
        state=state,
        redirect_uri="http://localhost:5000/oauth2callback"
    )
    flow.fetch_token(authorization_response=str(request.url))

    creds = flow.credentials
    with open(TOKEN_FILE, "w") as token:
        token.write(creds.to_json())

    return {"message": "Authorization complete! You can close this tab."}

    created_event = service.events().insert(calendarId="primary", body=event).execute()
    return {"message": "Event created!", "link": created_event.get("htmlLink")}

# ----------------------------
# Add simple event
# ----------------------------
@app.get("/add_event")
def add_event():
    if not os.path.exists(TOKEN_FILE):
        return {"error": "Not authorized. Go to /login first."}

    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    service = build("calendar", "v3", credentials=creds)

    event = {
        "summary": "Test Event",
        "location": "Nashville",
        "description": "This is a test event created by FastAPI.",
        "start": {"dateTime": "2025-09-01T10:00:00", "timeZone": "America/Chicago"},
        "end": {"dateTime": "2025-09-01T11:00:00", "timeZone": "America/Chicago"},
    }

    created_event = service.events().insert(calendarId="primary", body=event).execute()
    return {"message": "Event created!", "link": created_event.get("htmlLink")}
git 
# ----------------------------
# Event parsing & creation
# ----------------------------
class StructuredEvent(BaseModel):
    title: str
    start_datetime: str  # can be natural language
    end_datetime: str    # can be natural language
    location: str = ""
    notes: str = ""

@app.post("/add_event_structured")
async def add_event_structured(event: StructuredEvent):
    # Check token exists
    if not os.path.exists(TOKEN_FILE):
        return {"error": "Not authorized. Go to /login first."}

    # Load credentials
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    # Parse flexible datetime strings into ISO format
    start_iso = dateparser.parse(event.start_datetime)
    end_iso = dateparser.parse(event.end_datetime)
    if not start_iso or not end_iso:
        return {"error": "Could not parse date/time from text."}

    # Build event body
    new_event = {
        "summary": event.title,
        "location": event.location,
        "description": event.notes,
        "start": {"dateTime": start_iso.isoformat(), "timeZone": "America/Chicago"},
        "end": {"dateTime": end_iso.isoformat(), "timeZone": "America/Chicago"}
    }
    logging.debug("Creating event: %s", new_event)

    try:
        created = service.events().insert(calendarId="primary", body=new_event).execute()
        logging.info("Event created successfully: %s", created.get("htmlLink"))
        return {"message": "Event created!", "link": created.get("htmlLink")}
    except Exception as e:
        logging.exception("Failed to create event: %s", e)
        return {"error": "Failed to create event."}

    # created = service.events().insert(calendarId="primary", body=new_event).execute()
    # return {"message": "Event created!", "link": created.get("htmlLink")}

# ----------------------------
# Root Route (optional)
# ----------------------------
@app.get("/")
async def root():
    return {"message": "Backend running. Go to /login to authorize Google Calendar."}
