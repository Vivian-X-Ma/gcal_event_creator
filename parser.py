import re
from datetime import datetime, timedelta
import dateparser
import spacy
from pydantic import BaseModel

# Load spaCy English model
nlp = spacy.load("en_core_web_sm")

# ----------------------------
# Event Model
# ----------------------------
class StructuredEvent(BaseModel):
    title: str
    start_datetime: str
    end_datetime: str
    location: str = ""
    notes: str = ""

# ----------------------------
# Parsing Function
# ----------------------------
def parse_syllabus_line(line: str) -> StructuredEvent:
    doc = nlp(line)

    # --- Title Extraction ---
    # Take first token sequence before ':' or comma as title
    if ':' in line:
        title = line.split(':')[0].strip()
    elif ',' in line:
        title = line.split(',')[0].strip()
    else:
        title = line.strip().split()[0]

    # --- Date & Time Extraction ---
    # Use regex to find time ranges like "2–3:30pm"
    time_match = re.search(r'(\d{1,2}[:.]?\d{0,2}\s?(?:AM|PM|am|pm)?)\s*[–-]\s*(\d{1,2}[:.]?\d{0,2}\s?(?:AM|PM|am|pm)?)', line)
    
    # Use dateparser to find date(s)
    dates = dateparser.search.search_dates(line)
    if not dates:
        raise ValueError("No date found in line")
    
    start_date = dates[0][1]  # Take first date

    # Compute start and end datetime
    if time_match:
        # Parse start and end times
        start_time_str = f"{start_date.strftime('%Y-%m-%d')} {time_match.group(1)}"
        end_time_str   = f"{start_date.strftime('%Y-%m-%d')} {time_match.group(2)}"
        start_dt = dateparser.parse(start_time_str)
        end_dt   = dateparser.parse(end_time_str)
    else:
        # Default duration 1.5 hours
        start_dt = start_date
        end_dt = start_dt + timedelta(hours=1.5)

    # --- Location Extraction ---
    # Take last noun chunk after comma if exists
    if ',' in line:
        location = line.split(',')[-1].strip()
    else:
        location = ""

    # Build structured event
    event = StructuredEvent(
        title=title,
        start_datetime=start_dt.isoformat(),
        end_datetime=end_dt.isoformat(),
        location=location,
        notes=""
    )

    return event

# ----------------------------
# Example Usage
# ----------------------------
if __name__ == "__main__":
    test_lines = [
        "Exam 2: March 15, 2–3:30pm, Stevenson 432",
        "Lecture: April 3, 10:00 AM – 11:15 AM, Room 101",
        "Project Due: May 1, 11:59 PM"
    ]

    for line in test_lines:
        event = parse_syllabus_line(line)
        print(event.json(), end="\n\n")
