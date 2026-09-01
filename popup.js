// Store parsed events globally
let parsedEvents = [];
const storageKeys = {
    syllabusText: "savedSyllabusText",
    parsedEvents: "savedParsedEvents",
};

// Get DOM elements
const syllabusInput = document.getElementById("syllabusInput");
const processBtn = document.getElementById("processBtn");
const preview = document.getElementById("preview");
const eventList = document.getElementById("eventList");
const chatSection = document.getElementById("chatSection");
const chatInput = document.getElementById("chatInput");
const updateBtn = document.getElementById("updateBtn");
const addToCalendarBtn = document.getElementById("addToCalendarBtn");
const statusDiv = document.getElementById("status");
const settingsLink = document.getElementById("settingsLink");
let eventColorMapPromise = null;

document.getElementById("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
});

// Load saved syllabus text when popup opens
document.addEventListener("DOMContentLoaded", async () => {
    const result = await chrome.storage.local.get([
        storageKeys.syllabusText,
        storageKeys.parsedEvents,
    ]);

    if (result[storageKeys.syllabusText]) {
        syllabusInput.value = result[storageKeys.syllabusText];
    }

    if (
        Array.isArray(result[storageKeys.parsedEvents]) &&
        result[storageKeys.parsedEvents].length > 0
    ) {
        parsedEvents = result[storageKeys.parsedEvents];
        displayEventPreview(parsedEvents);
        preview.style.display = "block";
        chatSection.style.display = "block";
    }
});

// Save syllabus text as user types
syllabusInput.addEventListener("input", async () => {
    await chrome.storage.local.set({
        [storageKeys.syllabusText]: syllabusInput.value,
    });

    if (parsedEvents.length > 0) {
        parsedEvents = [];
        preview.style.display = "none";
        chatSection.style.display = "none";
        eventList.innerHTML = "";
        await chrome.storage.local.remove(storageKeys.parsedEvents);
    }
});

// Process button click
processBtn.addEventListener("click", async () => {
    const syllabusText = syllabusInput.value.trim();

    if (!syllabusText) {
        showStatus("Please paste syllabus text first", "error");
        return;
    }

    processBtn.disabled = true;
    processBtn.textContent = "Processing...";
    statusDiv.innerHTML = "";

    try {
        // Call Groq API to parse syllabus
        const events = await parseSyllabusWithGroq(syllabusText);
        parsedEvents = events;
        await chrome.storage.local.set({
            [storageKeys.parsedEvents]: parsedEvents,
        });

        // Display preview
        displayEventPreview(events);
        preview.style.display = "block";
        chatSection.style.display = "block";

        showStatus("Events parsed successfully!", "success");
    } catch (error) {
        showStatus("Error parsing syllabus", "error");
        console.error(error);
    } finally {
        processBtn.disabled = false;
        processBtn.textContent = "Process Events";
    }
});

// Update events based on chat input
updateBtn.addEventListener("click", async () => {
    const corrections = chatInput.value.trim();

    if (!corrections) {
        showStatus("Please enter corrections or clarifications", "error");
        return;
    }

    updateBtn.disabled = true;
    updateBtn.textContent = "Updating...";

    try {
        // Call Groq API with original syllabus + corrections
        const updatedEvents = await updateEventsWithChat(
            syllabusInput.value,
            corrections,
            parsedEvents,
        );
        parsedEvents = updatedEvents;
        await chrome.storage.local.set({
            [storageKeys.parsedEvents]: parsedEvents,
        });

        displayEventPreview(updatedEvents);
        chatInput.value = "";
        showStatus("Events updated!", "success");
    } catch (error) {
        showStatus("Error updating events: " + error.message, "error");
        console.error(error);
    } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = "Update Events";
    }
});

// Add to Google Calendar
addToCalendarBtn.addEventListener("click", async () => {
    if (parsedEvents.length === 0) {
        showStatus("No events to add", "error");
        return;
    }

    addToCalendarBtn.disabled = true;
    addToCalendarBtn.textContent = "Adding to Calendar...";

    try {
        // Get OAuth token
        const token = await getGoogleAuthToken();

        // Add each event to calendar
        for (const event of parsedEvents) {
            await addEventToGoogleCalendar(token, event);
        }

        showStatus(
            `Successfully added ${parsedEvents.length} events to Google Calendar!`,
            "success",
        );

        // Clear form after success
        setTimeout(() => {
            syllabusInput.value = "";
            chrome.storage.local.remove([
                storageKeys.syllabusText,
                storageKeys.parsedEvents,
            ]);
            preview.style.display = "none";
            chatSection.style.display = "none";
            eventList.innerHTML = "";
            parsedEvents = [];
        }, 2000);
    } catch (error) {
        showStatus("Error adding to calendar: " + error.message, "error");
        console.error(error);
    } finally {
        addToCalendarBtn.disabled = false;
        addToCalendarBtn.textContent = "Add to Google Calendar";
    }
});

// Parse syllabus using Groq API
async function parseSyllabusWithGroq(syllabusText) {
    // Get API key from storage
    const result = await chrome.storage.sync.get(["groqApiKey"]);
    const apiKey = result.groqApiKey;

    if (!apiKey) {
        throw new Error(
            "Groq API key not set. Please add it in extension options.",
        );
    }

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    {
                        role: "system",
                        content: `You are a syllabus parser. Extract calendar events from syllabi and return them as a JSON array.

Each event should have:
- eventType: one of "assignment", "quiz", "exam", "project, or other (if unidentifiable)"
                        - If something does not clearly fit one of those categories, classify it as "other" only if it is still clearly a course event; otherwise skip it.
- title: brief name of the assignment/event (if provided, use the exact name, do not infer)
- description: additional details if available (optional, can be empty string)
- dueDate: ISO 8601 format (YYYY-MM-DDTHH:MM:SS), use 23:59:59 as the end time for assignments without specific times. If no year is specified, assume the current year ${new Date().getFullYear()}.
- startDate: ISO 8601 format (YYYY-MM-DDTHH:MM:SS), use 30 minutes before dueDate as a default
- className: the course name/code from the syllabus
- startDate: ONLY include this field if the syllabus explicitly gives a start date/time AND an end date/time for the event (e.g. "Project work period: Oct 1 - Oct 5" or "Exam window: 9:00 AM - 11:00 AM"). ISO 8601 format. Omit this field entirely if there's only a single deadline.
- endDate: ONLY include this field if startDate is also included. ISO 8601 format.
- Use the exact wording from the syllabus when possible for title and className.


Return ONLY valid JSON with an "events" array, no markdown formatting or explanation.

Output format:
Return ONLY valid JSON with this structure:

Here is an example:
{
  "events": [
    {
      "eventType": "homework | quiz | exam | project | other",
      "title": "exact or near-exact assignment name from the syllabus",
      "description": "short supporting details from the syllabus, or empty string",
      "dueDate": "ISO 8601 datetime if clearly stated, otherwise empty string",
      "startDate": "ISO 8601 datetime only if dueDate is known, otherwise empty string",
      "className": "exact course name/code if clearly stated, otherwise 'Unknown Class'"
    }
  ]
}



`,
                    },
                    {
                        role: "user",
                        content: `Parse this syllabus:\n\n${syllabusText}`,
                    },
                ],
                temperature: 0.1,
                response_format: { type: "json_object" },
            }),
        },
    );

    if (!response.ok) {
        throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return parsed.events || [];
}

// Update events based on chat corrections
async function updateEventsWithChat(
    originalSyllabus,
    corrections,
    currentEvents,
) {
    const result = await chrome.storage.sync.get(["groqApiKey"]);
    const apiKey = result.groqApiKey;

    const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    {
                        role: "system",
                        content: `You are updating a previously extracted syllabus event list.

Rules:
- Only modify events based on the user’s correction and the original syllabus text.
- Do not invent new events.
- Do not change dates, titles, event types, or classes unless the correction clearly requires it.
- Preserve any event that is not directly affected by the correction.
- If a correction is ambiguous, make the smallest possible change.
`,
                    },
                    {
                        role: "user",
                        content: `Original syllabus:\n${originalSyllabus}\n\nCurrent events:\n${JSON.stringify(
                            currentEvents,
                            null,
                            2,
                        )}\n\nUser corrections:\n${corrections}\n\nPlease update the events based on these corrections.`,
                    },
                ],
                temperature: 0.1,
                response_format: { type: "json_object" },
            }),
        },
    );

    const data = await response.json();
    const parsed = JSON.parse(data.choices[0].message.content);

    return parsed.events || [];
}

// Display event preview
function displayEventPreview(events) {
    eventList.innerHTML = "";

    events.forEach((event, index) => {
        const eventItem = document.createElement("div");
        eventItem.className = "event-item";

        const date = new Date(event.dueDate);
        const formattedDate = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

        eventItem.innerHTML = `
      <div class="event-title">${index + 1}. ${event.title}</div>
      <div class="event-details">
        ${event.className} • ${event.eventType} • ${formattedDate}
        ${event.description ? "<br>" + event.description : ""}
      </div>
    `;

        eventList.appendChild(eventItem);
    });
}

// Get Google OAuth token
async function getGoogleAuthToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(token);
            }
        });
    });
}

// Add event to Google Calendar
async function addEventToGoogleCalendar(token, event) {
    const hasRange = event.startDate && event.endDate;
    const DEFAULT_COLORS = {
        assignment: "2",
        quiz: "6",
        project: "3",
        exam: "11",
        other: "1",
    };

    const stored = await chrome.storage.sync.get(["colorSettings"]);
    const colorSettings = stored.colorSettings || {};
    const colorId =
        colorSettings[event.eventType] ||
        DEFAULT_COLORS[event.eventType] ||
        "1";

    const calendarEvent = {
        summary: event.title,
        description: `${event.className} - ${event.eventType}${
            event.description ? "\n\n" + event.description : ""
        }`,
        colorId: colorId,
        reminders: {
            useDefault: false,
            overrides: [
                { method: "popup", minutes: 30 },
                { method: "popup", minutes: 1440 },
                //TODO: Right now this is manually set, add this to user options
                // Change this number to adjust notification time manually
            ],
        },
    };

    if (hasRange) {
        // Timed event with a real start and end
        calendarEvent.start = {
            dateTime: event.startDate,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        calendarEvent.end = {
            dateTime: event.endDate,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
    } else {
        // Full-day event
        calendarEvent.start = {
            date: event.dueDate.split("T")[0],
        };
        calendarEvent.end = {
            date: event.dueDate.split("T")[0],
        };
    }

    const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(calendarEvent),
        },
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(
            error.error.message || "Failed to add event to calendar",
        );
    }

    return response.json();
}

async function getEventColorMap() {
    if (!eventColorMapPromise) {
        eventColorMapPromise = chrome.storage.sync.get([
            "eventColorHomework",
            "eventColorQuiz",
            "eventColorExam",
            "eventColorProject",
            "eventColorOther",
        ]);
    }

    const result = await eventColorMapPromise;

    return {
        homework: result.eventColorHomework || "2",
        quiz: result.eventColorQuiz || "6",
        exam: result.eventColorExam || "11",
        project: result.eventColorProject || "3",
        other: result.eventColorOther || "1",
    };
}

// Show status message
function showStatus(message, type) {
    statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;

    if (type === "success") {
        setTimeout(() => {
            statusDiv.innerHTML = "";
        }, 3000);
    }
}
