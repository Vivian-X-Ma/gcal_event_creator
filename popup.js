// Store parsed events globally
let parsedEvents = [];

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

document.getElementById("settingsLink").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("options.html") });
});

// Load saved syllabus text when popup opens
document.addEventListener("DOMContentLoaded", async () => {
    const result = await chrome.storage.local.get(["savedSyllabusText"]);
    if (result.savedSyllabusText) {
        syllabusInput.value = result.savedSyllabusText;
    }
});

// Save syllabus text as user types
syllabusInput.addEventListener("input", async () => {
    await chrome.storage.local.set({ savedSyllabusText: syllabusInput.value });
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

        // Display preview
        displayEventPreview(events);
        preview.style.display = "block";
        chatSection.style.display = "block";

        showStatus("Events parsed successfully!", "success");
    } catch (error) {
        showStatus("Error parsing syllabus: " + error.message, "error");
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
            parsedEvents
        );
        parsedEvents = updatedEvents;

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
            "success"
        );

        // Clear form after success
        setTimeout(() => {
            syllabusInput.value = "";
            chrome.storage.local.remove("savedSyllabusText");
            preview.style.display = "none";
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
            "Groq API key not set. Please add it in extension options."
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
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `You are a syllabus parser. Extract calendar events from syllabi and return them as a JSON array.

Each event should have:
- eventType: one of "homework", "quiz", "exam", "project"
- title: brief name of the assignment/event
- description: additional details if available (optional, can be empty string)
- dueDate: ISO 8601 format (YYYY-MM-DDTHH:MM:SS), use 23:59:59 as the end time for assignments without specific times. If no year is specified, assume the current year ${new Date().getFullYear()}.
- startDate: ISO 8601 format (YYYY-MM-DDTHH:MM:SS), use 30 minutes before dueDate as a default
- className: the course name/code from the syllabus

If there is no className, use a default of "Unknown Class." If there is not a specific eventType keyword, use your best judgment to categorize the event into one of the categories. 
Return ONLY valid JSON with an "events" array, no markdown formatting or explanation.`,
                    },
                    {
                        role: "user",
                        content: `Parse this syllabus:\n\n${syllabusText}`,
                    },
                ],
                temperature: 0.1,
                response_format: { type: "json_object" },
            }),
        }
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
    currentEvents
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
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `You are a syllabus parser. Update the event list based on user corrections.

Return ONLY valid JSON with an "events" array in the same format as before.`,
                    },
                    {
                        role: "user",
                        content: `Original syllabus:\n${originalSyllabus}\n\nCurrent events:\n${JSON.stringify(
                            currentEvents,
                            null,
                            2
                        )}\n\nUser corrections:\n${corrections}\n\nPlease update the events based on these corrections.`,
                    },
                ],
                temperature: 0.1,
                response_format: { type: "json_object" },
            }),
        }
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
    // Map event types to Google Calendar color IDs

    //TODO: adjust here
    const colorMap = {
        homework: "2", // light green
        quiz: "6", // orange
        exam: "11", // Red
        project: "3", // Grape
    };
    const calendarEvent = {
        summary: event.title,
        description: `${event.className} - ${event.eventType}${
            event.description ? "\n\n" + event.description : ""
        }`,
        //TODO: allow user to adjust if they want a full day or a time and due date here, or offer double functionality
        start: {
            // setting a full day event, which i prefer for my assignments
            date: event.dueDate.split('T')[0],  // Just "2024-09-15"

            //setting specific time and due date
            // dateTime: event.startDate,
            // timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
            date: event.dueDate.split('T')[0],  // Just "2024-09-15"

            // dateTime: event.dueDate,
            // timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        colorId: colorMap[event.eventType] || "1",
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

    const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(calendarEvent),
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(
            error.error.message || "Failed to add event to calendar"
        );
    }

    return response.json();
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
