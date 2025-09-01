import requests

url = "http://localhost:5000/add_event_structured"
payload = {
    "title": "Test Event",
    "start_datetime": "Aug 31 2025 14:00",
    "end_datetime": "Aug 31 2025 15:00",
    "location": "Vanderbilt Campus",
    "notes": "This is a test event created via FastAPI",
}

response = requests.post(url, json=payload)
print(response.json())
