const API_BASE = "";

let currentSessionId = null;
let isSending = false;

const sessionList = document.getElementById("sessionList");
const chatArea = document.getElementById("chatArea");
const messagesContainer = document.getElementById("messagesContainer");
const welcomeScreen = document.getElementById("welcomeScreen");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const newChatButton = document.getElementById("newChatButton");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");

marked.setOptions({
    gfm: true,
    breaks: true
});

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
        throw new Error(error.detail || `Request failed: ${response.status}`);
    }
    return response.json();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: "smooth" });
    });
}

function setSidebarOpen(open) {
    sidebar.classList.toggle("open", open);
    sidebarBackdrop.classList.toggle("visible", open);
}

async function createSession() {
    const data = await apiRequest("/api/sessions", { method: "POST" });
    currentSessionId = data.session_id;
    messagesContainer.innerHTML = "";
    welcomeScreen.hidden = false;
    await loadSessions();
    setSidebarOpen(false);
    return currentSessionId;
}

async function loadSessions() {
    const data = await apiRequest("/api/sessions");
    sessionList.innerHTML = "";

    data.sessions.forEach(session => {
        const item = document.createElement("div");
        item.className = "session-item";
        if (session.session_id === currentSessionId) item.classList.add("active");

        const openButton = document.createElement("button");
        openButton.className = "session-open";
        openButton.type = "button";
        openButton.textContent = session.title || "New conversation";
        openButton.title = session.title || "New conversation";
        openButton.addEventListener("click", () => openSession(session.session_id));

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-session";
        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.title = "Delete conversation";
        deleteButton.setAttribute("aria-label", "Delete conversation");

        deleteButton.addEventListener("click", async event => {
            event.stopPropagation();
            if (!confirm("Delete this conversation permanently?")) return;

            try {
                await apiRequest(`/api/sessions/${session.session_id}`, { method: "DELETE" });
                if (currentSessionId === session.session_id) {
                    currentSessionId = null;
                    messagesContainer.innerHTML = "";
                    welcomeScreen.hidden = false;
                }
                await loadSessions();
            } catch (error) {
                showToast(error.message);
            }
        });

        item.append(openButton, deleteButton);
        sessionList.appendChild(item);
    });
}

async function openSession(sessionId) {
    try {
        const data = await apiRequest(`/api/sessions/${sessionId}`);
        currentSessionId = sessionId;
        messagesContainer.innerHTML = "";
        welcomeScreen.hidden = data.messages.length !== 0;

        data.messages.forEach(message => {
            if (message && ["user", "assistant"].includes(message.role)) {
                addMessage(message.role, message.content || "");
            }
        });

        await loadSessions();
        setSidebarOpen(false);
        scrollToBottom();
    } catch (error) {
        showToast(error.message);
    }
}

function renderMarkdown(content, container) {
    // Model output is untrusted: parse Markdown, then sanitize before insertion.
    const rawHtml = marked.parse(String(content ?? ""));
    container.innerHTML = DOMPurify.sanitize(rawHtml);

    container.querySelectorAll("pre code").forEach(code => {
        if (window.hljs) hljs.highlightElement(code);
        decorateCodeBlock(code);
    });

    container.querySelectorAll("a").forEach(link => {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    });
}

function decorateCodeBlock(code) {
    const pre = code.closest("pre");
    if (!pre || pre.parentElement.classList.contains("code-block")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-block-header";

    const languageClass = [...code.classList].find(name => name.startsWith("language-"));
    const language = languageClass ? languageClass.replace("language-", "") : "code";

    const languageLabel = document.createElement("span");
    languageLabel.className = "code-language";
    languageLabel.textContent = language.toUpperCase();

    const copyButton = document.createElement("button");
    copyButton.className = "copy-code-button";
    copyButton.type = "button";
    copyButton.innerHTML = '<span aria-hidden="true">▢</span> Copy';
    copyButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(code.textContent);
            copyButton.innerHTML = '<span aria-hidden="true">✓</span> Copied';
            setTimeout(() => {
                copyButton.innerHTML = '<span aria-hidden="true">▢</span> Copy';
            }, 1400);
        } catch {
            showToast("Clipboard access was unavailable in this browser.");
        }
    });

    header.append(languageLabel, copyButton);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(header, pre);
}

function addMessage(role, content) {
    welcomeScreen.hidden = true;

    const message = document.createElement("article");
    message.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "Y" : "N";
    avatar.setAttribute("aria-hidden", "true");

    const messageContent = document.createElement("div");
    messageContent.className = "message-content";

    if (role === "assistant") {
        renderMarkdown(content, messageContent);
    } else {
        // User messages remain plain text; never interpret user input as HTML.
        messageContent.textContent = content;
    }

    message.append(avatar, messageContent);
    messagesContainer.appendChild(message);
    scrollToBottom();
    return message;
}

function showTypingIndicator() {
    const indicator = addMessage("assistant", "");
    const content = indicator.querySelector(".message-content");
    content.classList.add("typing-indicator");
    content.innerHTML = '<span>NeuralForge is thinking</span><span class="typing-dots"><i></i><i></i><i></i></span>';
    return indicator;
}

function showToast(message) {
    let toast = document.getElementById("appToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "appToast";
        toast.className = "app-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove("visible"), 2600);
}

async function sendMessage(text = null) {
    if (isSending) return;

    const messageText = (text ?? messageInput.value).trim();
    if (!messageText) return;

    isSending = true;
    sendButton.disabled = true;
    messageInput.value = "";
    resizeInput();

    let typingIndicator = null;

    try {
        if (!currentSessionId) await createSession();

        addMessage("user", messageText);
        typingIndicator = showTypingIndicator();

        const data = await apiRequest("/api/chat", {
            method: "POST",
            body: JSON.stringify({
                session_id: currentSessionId,
                message: messageText
            })
        });

        typingIndicator.remove();
        addMessage("assistant", data.response ?? "The model returned an empty response.");
        await loadSessions();
    } catch (error) {
        if (typingIndicator) typingIndicator.remove();
        addMessage("assistant", `**Something went wrong.**\n\n${error.message}`);
        console.error("Chat request failed:", error);
    } finally {
        isSending = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

function resizeInput() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

sendButton.addEventListener("click", () => sendMessage());

messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener("input", resizeInput);

newChatButton.addEventListener("click", async () => {
    try {
        await createSession();
        messageInput.focus();
    } catch (error) {
        showToast(error.message);
    }
});

document.querySelectorAll(".suggestion-card").forEach(card => {
    card.addEventListener("click", () => sendMessage(card.dataset.prompt));
});

document.getElementById("mobileMenu").addEventListener("click", () => setSidebarOpen(true));
document.getElementById("sidebarClose").addEventListener("click", () => setSidebarOpen(false));
sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));

document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        createSession().catch(error => showToast(error.message));
    }
    if (event.key === "Escape") setSidebarOpen(false);
});

async function initializeApp() {
    try {
        await loadSessions();
        const data = await apiRequest("/api/sessions");
        if (data.sessions.length > 0) {
            await openSession(data.sessions[0].session_id);
        }
    } catch (error) {
        console.error("Initialization failed:", error);
        showToast("Could not connect to the backend. Check that FastAPI is running.");
    }
}

initializeApp();
