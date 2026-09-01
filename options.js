// Get DOM elements
const apiKeyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("saveBtn");
const statusDiv = document.getElementById("status");
const eventTypeList = document.getElementById("eventTypeList");

const EVENT_TYPES = {
    assignment: "Assignment",
    quiz: "Quiz",
    project: "Project",
    exam: "Exam",
    other: "Other",
};

const defaultColorValues = {
    assignment: "2",
    quiz: "6",
    exam: "11",
    project: "3",
    other: "1",
};

const colorOptions = [
    { value: "1", label: "Lavender" },
    { value: "2", label: "Sage" },
    { value: "3", label: "Grape" },
    { value: "4", label: "Flamingo" },
    { value: "5", label: "Banana" },
    { value: "6", label: "Tangerine" },
    { value: "7", label: "Peacock" },
    { value: "8", label: "Graphite" },
    { value: "9", label: "Blueberry" },
    { value: "10", label: "Basil" },
    { value: "11", label: "Tomato" },
];

const colorByValue = Object.fromEntries(
    colorOptions.map((option) => [option.value, option]),
);

function buildColorSelect(selectElement, defaultValue) {
    selectElement.innerHTML = "";

    colorOptions.forEach((option) => {
        const optionElement = document.createElement("option");
        optionElement.value = option.value;
        optionElement.textContent = `${option.value} - ${option.label}`;
        if (option.value === defaultValue) {
            optionElement.selected = true;
        }
        selectElement.appendChild(optionElement);
    });
}

function getSavedColorSettings() {
    return chrome.storage.sync.get([
        "eventColorAssignment",
        "eventColorQuiz",
        "eventColorExam",
        "eventColorProject",
        "eventColorOther",
    ]);
}

function setSelectValue(selectElement, value, fallbackValue) {
    const desiredValue = value || fallbackValue;
    selectElement.value = desiredValue;
}

// Render the 5 fixed event type rows
function renderEventTypeRows(colorSettings) {
    eventTypeList.innerHTML = "";

    Object.keys(EVENT_TYPES).forEach((key) => {
        const selectedColor = colorSettings[key] || DEFAULT_COLORS[key];

        const row = document.createElement("div");
        row.className = "event-type-row";
        row.innerHTML = `
      <span class="event-type-label">${EVENT_TYPES[key]}</span>
      <span class="swatch" id="swatch-${key}"></span>
      <select id="color-${key}" data-key="${key}">
        ${buildColorOptionsHTML(selectedColor)}
      </select>
    `;
        eventTypeList.appendChild(row);
    });
    // Set initial swatch colors and attach change listeners
    Object.keys(EVENT_TYPES).forEach((key) => {
        updateSwatch(key);
        document
            .getElementById(`color-${key}`)
            .addEventListener("change", () => updateSwatch(key));
    });
}

// Update a single swatch's background color based on its select value
function updateSwatch(key) {
    const select = document.getElementById(`color-${key}`);
    const swatch = document.getElementById(`swatch-${key}`);
    const color = COLOR_OPTIONS.find((c) => c.id === select.value);
    swatch.style.backgroundColor = color ? color.hex : "#fff";
}

// Load saved API key and settings when page opens
document.addEventListener("DOMContentLoaded", async () => {
    const result = await chrome.storage.sync.get([
        "groqApiKey",
        "colorSettings",
    ]);

    if (result.groqApiKey) {
        apiKeyInput.value = result.groqApiKey;
    }

    const colorSettings = result.colorSettings || {};
    renderEventTypeRows(colorSettings);
});

// Save button click handler
saveBtn.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
        showStatus("Please enter an API key", "error");
        return;
    }

    // Validate that it looks like a Groq API key
    if (!apiKey.startsWith("gsk_")) {
        showStatus(
            'Invalid API key format. Groq keys start with "gsk_"',
            "error",
        );
        return;
    }

    const colorSettings = {};
    Object.keys(EVENT_TYPES).forEach((key) => {
        colorSettings[key] = document.getElementById(`color-${key}`).value;
    });
    try {
        // Save to chrome storage
        await chrome.storage.sync.set({
            groqApiKey: apiKey,
            colorSettings: ColorSettings,
        });
        showStatus("Settings saved successfully!", "success");

        // Clear success message after 2 seconds
        setTimeout(() => {
            statusDiv.className = "status";
            statusDiv.textContent = "";
        }, 2000);
    } catch (error) {
        showStatus("Error saving settings: " + error.message, "error");
    }
});

// Show status message
function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}
