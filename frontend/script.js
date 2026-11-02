const API_BASE = "";

let currentSessionId = null;
let isSending = false;

// DOM elements
const sessionList = document.getElementById("sessionList");
const chatArea = document.getElementById("chatArea");
const messagesContainer = document.getElementById("messagesContainer");
const welcomeScreen = document.getElementById("welcomeScreen");

const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const newChatButton = document.getElementById("newChatButton");


// API helper
async function apiRequest(endpoint, options = {}) {

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));

        throw new Error(
            error.detail || `Request failed: ${response.status}`
        );
    }

    return response.json();
}


// Create a new conversation
async function createSession() {

    const data = await apiRequest("/api/sessions", {
        method: "POST"
    });

    currentSessionId = data.session_id;

    messagesContainer.innerHTML = "";
    welcomeScreen.style.display = "block";

    await loadSessions();

    return currentSessionId;
}


// Load all conversations into sidebar
async function loadSessions() {

    const data = await apiRequest("/api/sessions");

    sessionList.innerHTML = "";

    data.sessions.forEach(session => {

        const item = document.createElement("div");
        item.className = "session-item";

        if (session.session_id === currentSessionId) {
            item.classList.add("active");
        }

        const title = document.createElement("span");
        title.className = "session-title";
        title.textContent = session.title || "New conversation";

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-session";
        deleteButton.textContent = "×";
        deleteButton.title = "Delete conversation";

        item.appendChild(title);
        item.appendChild(deleteButton);

        item.addEventListener("click", () => {
            openSession(session.session_id);
        });

        deleteButton.addEventListener("click", async (event) => {

            event.stopPropagation();

            const confirmed = confirm(
                "Delete this conversation permanently?"
            );

            if (!confirmed) return;

            try {
                await apiRequest(
                    `/api/sessions/${session.session_id}`,
                    { method: "DELETE" }
                );

                if (currentSessionId === session.session_id) {
                    currentSessionId = null;
                    messagesContainer.innerHTML = "";
                    welcomeScreen.style.display = "block";
                }

                await loadSessions();

            } catch (error) {
                alert(error.message);
            }
        });

        sessionList.appendChild(item);
    });
}


// Open an existing conversation
async function openSession(sessionId) {

    try {

        const data = await apiRequest(
            `/api/sessions/${sessionId}`
        );

        currentSessionId = sessionId;

        messagesContainer.innerHTML = "";

        welcomeScreen.style.display =
            data.messages.length === 0 ? "block" : "none";

        data.messages.forEach(message => {
            addMessage(message.role, message.content);
        });

        await loadSessions();

        chatArea.scrollTop = chatArea.scrollHeight;

    } catch (error) {
        alert(error.message);
    }
}


// Add a message to the interface
function addMessage(role, content) {

    welcomeScreen.style.display = "none";

    const message = document.createElement("div");
    message.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "Y" : "N";

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    // textContent prevents model output from being interpreted as HTML.
    messageContent.textContent = content;

    message.appendChild(avatar);
    message.appendChild(messageContent);

    messagesContainer.appendChild(message);

    chatArea.scrollTop = chatArea.scrollHeight;

    return message;
}


// Show loading indicator
function showTypingIndicator() {

    const indicator = addMessage(
        "assistant",
        "NeuralForge is thinking..."
    );

    indicator.querySelector(".message-content").classList.add(
        "typing-indicator"
    );

    return indicator;
}


// Send message to backend
async function sendMessage(text = null) {

    if (isSending) return;

    const message = (text || messageInput.value).trim();

    if (!message) return;

    isSending = true;
    sendButton.disabled = true;

    messageInput.value = "";

    try {

        // Create a session automatically if required
        if (!currentSessionId) {
            await createSession();
        }

        addMessage("user", message);

        const typingIndicator = showTypingIndicator();

        const data = await apiRequest("/api/chat", {
            method: "POST",

            body: JSON.stringify({
                session_id: currentSessionId,
                message: message
            })
        });

        typingIndicator.remove();

        addMessage("assistant", data.response);

        await loadSessions();

    } catch (error) {

        addMessage(
            "assistant",
            `Something went wrong: ${error.message}`
        );

        console.error(error);

    } finally {

        isSending = false;
        sendButton.disabled = false;

        messageInput.focus();
    }
}


// Event listeners

sendButton.addEventListener("click", () => {
    sendMessage();
});


messageInput.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});


messageInput.addEventListener("input", () => {

    messageInput.style.height = "auto";

    messageInput.style.height =
        `${Math.min(messageInput.scrollHeight, 160)}px`;
});


newChatButton.addEventListener("click", async () => {

    try {
        await createSession();
        messageInput.focus();
    } catch (error) {
        alert(error.message);
    }
});


// Suggestion cards
document.querySelectorAll(".suggestion-card").forEach(card => {

    card.addEventListener("click", () => {

        const prompt = card.dataset.prompt;

        sendMessage(prompt);
    });
});


// Mobile sidebar
document.getElementById("mobileMenu").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});


// Initialize application
async function initializeApp() {

    try {

        await loadSessions();

        const data = await apiRequest("/api/sessions");

        if (data.sessions.length > 0) {
            await openSession(data.sessions[0].session_id);
        }

    } catch (error) {

        console.error("Initialization failed:", error);

        alert("Could not connect to the backend.");

    }
}


initializeApp();