document.addEventListener("DOMContentLoaded", () => {
  // DOM references
  const CHAT_WINDOW = document.getElementById("chatWindow");
  const INPUT = document.getElementById("msg");
  const SEND = document.getElementById("send");
  const RESET = document.getElementById("reset");

  // Use CHAT_WINDOW instead of HISTORY
  function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = "chat-message " + role;
    msgDiv.textContent = text;
    CHAT_WINDOW.appendChild(msgDiv);
    CHAT_WINDOW.scrollTop = CHAT_WINDOW.scrollHeight;
  }

  function sessionId() {
    let s = localStorage.getItem("sid");
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem("sid", s);
    }
    return s;
  }

  // Reset button
  RESET.addEventListener("click", async (e) => {
    e.preventDefault();
    const s = sessionId();
    const res = await fetch("/api/message", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: s }),
    });

    if (!res.ok) {
      alert("Failed to reset chat");
      return;
    }

    CHAT_WINDOW.innerHTML = "";
    localStorage.removeItem("sid");
    alert("Chat session reset!");
  });

  // Load history
  async function loadHistory() {
    const sid = sessionId();
    const res = await fetch(`/api/history?sessionId=${encodeURIComponent(sid)}`);
    if (!res.ok) return;
    const msgs = await res.json();
    CHAT_WINDOW.innerHTML = "";
    for (const m of msgs) appendMessage(m.role, m.content);
  }

  // Send message
  SEND.addEventListener("click", async () => {
    const txt = INPUT.value.trim();
    if (!txt) return;
    appendMessage("user", txt);
    INPUT.value = "";
    const sid = sessionId();
    const res = await fetch("/api/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sid, message: txt }),
    });
    const data = await res.json();
    appendMessage("assistant", data.reply);
  });

  INPUT.addEventListener("keydown", (e) => {
    if (e.key === "Enter") SEND.click();
  });

  loadHistory();
});
