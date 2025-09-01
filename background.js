chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "addEvent",
      title: "Add to Google Calendar",
      contexts: ["selection"]
    });
  });
  
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "addEvent" && info.selectionText) {
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
        func: sendEvent,
        args: [info.selectionText]
      });
    }
  });
  
  function sendEvent(selectedText) {
    fetch("http://localhost:5000/add_event", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({text: selectedText})
    })
    .then(res => res.json())
    .then(data => alert(`Event created! Link: ${data.link}`))
    .catch(err => alert("Error creating event: " + err));
  }
  