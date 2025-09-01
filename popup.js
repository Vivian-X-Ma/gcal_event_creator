document.getElementById("addEventBtn").addEventListener("click", () => {
    const text = document.getElementById("eventText").value;
    const status = document.getElementById("status");
  
    if (!text) {
      status.textContent = "Please enter some text!";
      return;
    }
  
    fetch("http://localhost:5000/add_event", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({text})
    })
    .then(res => res.json())
    .then(data => {
      status.innerHTML = `Event created! <a href="${data.link}" target="_blank">View in Calendar</a>`;
    })
    .catch(err => {
      status.textContent = "Error: " + err;
    });
  });
  