const API_BASE = "";

let currentSessionId = null;
let isSending = false;
let activeController = null;
let lastSubmittedPrompt = null;

const sessionList = document.getElementById("sessionList");
const chatArea = document.getElementById("chatArea");
const messagesContainer = document.getElementById("messagesContainer");
const welcomeScreen = document.getElementById("welcomeScreen");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const stopButton = document.getElementById("stopButton");
const newChatButton = document.getElementById("newChatButton");
const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");

marked.setOptions({ gfm: true, breaks: true });

async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...options.headers }
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

function setGenerating(generating) {
    isSending = generating;
    sendButton.hidden = generating;
    stopButton.hidden = !generating;
    messageInput.disabled = generating;
    if (generating) {
        stopButton.focus({ preventScroll: true });
    } else {
        messageInput.disabled = false;
        messageInput.focus({ preventScroll: true });
    }
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
        openButton.addEventListener("click", () => {
            if (!isSending) openSession(session.session_id);
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-session";
        deleteButton.type = "button";
        deleteButton.textContent = "×";
        deleteButton.title = "Delete conversation";
        deleteButton.setAttribute("aria-label", "Delete conversation");
        deleteButton.addEventListener("click", async event => {
            event.stopPropagation();
            if (isSending) {
                showToast("Stop the current response before deleting a conversation.");
                return;
            }
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
    if (isSending) return;
    try {
        const data = await apiRequest(`/api/sessions/${sessionId}`);
        currentSessionId = sessionId;
        messagesContainer.innerHTML = "";
        welcomeScreen.hidden = data.messages.length !== 0;

        data.messages.forEach(message => {
            // Older JSONL files may contain "roles"; newer records use "role".
            const role = message?.role || message?.roles;
            if (["user", "assistant"].includes(role)) {
                addMessage(role, message.content || "");
            }
        });

        await loadSessions();
        setSidebarOpen(false);
        scrollToBottom();
    } catch (error) {
        showToast(error.message);
    }
}

function decorateCodeBlock(code) {
    const pre = code.closest("pre");
    if (!pre || pre.parentElement?.classList.contains("code-block")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "code-block";

    const header = document.createElement("div");
    header.className = "code-block-header";

    const languageClass = [...code.classList].find(name => name.startsWith("language-"));
    const language = languageClass ? languageClass.replace("language-", "") : "code";

    const label = document.createElement("span");
    label.className = "code-language";
    label.textContent = language.toUpperCase();

    const copyButton = document.createElement("button");
    copyButton.className = "copy-code-button";
    copyButton.type = "button";
    copyButton.innerHTML = '<span aria-hidden="true">▢</span> Copy';
    copyButton.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(code.textContent);
            copyButton.textContent = "✓ Copied";
            setTimeout(() => { copyButton.innerHTML = '<span aria-hidden="true">▢</span> Copy'; }, 1400);
        } catch {
            showToast("Clipboard access was unavailable in this browser.");
        }
    });

    header.append(label, copyButton);
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.append(header, pre);
}

function renderMarkdown(content, container) {
    const rawHtml = marked.parse(String(content ?? ""));
    container.innerHTML = DOMPurify.sanitize(rawHtml);

    container.querySelectorAll("pre code").forEach(code => {
        if (window.hljs && !code.dataset.highlighted) {
            try { hljs.highlightElement(code); } catch (error) { console.warn("Highlighting skipped:", error); }
        }
        decorateCodeBlock(code);
    });

    container.querySelectorAll("a").forEach(link => {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    });
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

    if (role === "assistant") renderMarkdown(content, messageContent);
    else messageContent.textContent = content;

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

/*
 * The backend emits SSE frames in this shape:
 * data: {"type":"token","content":"..."}
 * data: {"type":"done","session_id":"...","usage":{...}}
 * data: {"type":"error","message":"..."}
 */
async function streamChat(prompt, assistantContent, signal) {
    const response = await fetch(`${API_BASE}/api/chat/stream`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        },
        body: JSON.stringify({
            session_id: currentSessionId,
            message: prompt
        }),
        signal
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `Streaming request failed: ${response.status}`);
    }
    if (!response.body) throw new Error("This browser does not support response streaming.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let completed = false;

    const processFrame = frame => {
        const dataLines = frame.split(/\r?\n/)
            .filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).trimStart());

        if (!dataLines.length) return;
        const payload = JSON.parse(dataLines.join("\n"));

        if (payload.type === "token") {
            fullText += payload.content || "";
            renderMarkdown(fullText, assistantContent);
            scrollToBottom();
        } else if (payload.type === "done") {
            completed = true;
            if (payload.session_id) currentSessionId = payload.session_id;
        } else if (payload.type === "error") {
            throw new Error(payload.message || "The model could not complete the response.");
        }
    };

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split(/\r?\n\r?\n/);
            buffer = frames.pop() || "";

            for (const frame of frames) processFrame(frame);
        }

        buffer += decoder.decode();
        if (buffer.trim()) processFrame(buffer);
    } catch (error) {
        try { await reader.cancel(); } catch { /* connection may already be closed */ }
        throw error;
    }

    return { text: fullText, completed };
}

async function sendMessage(text = null) {
    if (isSending) return;

    const prompt = (text ?? messageInput.value).trim();
    if (!prompt) return;

    lastSubmittedPrompt = prompt;
    messageInput.value = "";
    resizeInput();

    try {
        if (!currentSessionId) await createSession();

        addMessage("user", prompt);
        const assistantMessage = addMessage("assistant", "");
        const assistantContent = assistantMessage.querySelector(".message-content");
        assistantContent.classList.add("streaming-content");

        activeController = new AbortController();
        setGenerating(true);

        const result = await streamChat(prompt, assistantContent, activeController.signal);

        assistantContent.classList.remove("streaming-content");
        if (!result.text) {
            assistantContent.textContent = result.completed
                ? "The model returned an empty response."
                : "Generation ended before any text was received.";
        } else if (!result.completed) {
            appendMessageNotice(assistantContent, "Generation ended before completion.");
        }

        await loadSessions();
    } catch (error) {
        if (error.name === "AbortError") {
            const currentAssistant = messagesContainer.lastElementChild?.querySelector(".message-content");
            if (currentAssistant) {
                currentAssistant.classList.remove("streaming-content");
                appendMessageNotice(currentAssistant, "Generation stopped.");
            }
        } else {
            const currentAssistant = messagesContainer.lastElementChild?.querySelector(".message-content");
            if (currentAssistant) {
                currentAssistant.classList.remove("streaming-content");
                if (!currentAssistant.textContent.trim()) {
                    currentAssistant.textContent = `Something went wrong: ${error.message}`;
                } else {
                    appendMessageNotice(currentAssistant, `Stream interrupted: ${error.message}`);
                }
            }
            console.error("Streaming request failed:", error);
        }
    } finally {
        activeController = null;
        setGenerating(false);
        try { await loadSessions(); } catch (error) { console.warn("Could not refresh sessions:", error); }
    }
}

function appendMessageNotice(container, text) {
    const notice = document.createElement("p");
    notice.className = "generation-notice";
    notice.textContent = text;
    container.appendChild(notice);
}

function stopGeneration() {
    if (activeController) activeController.abort();
}

function resizeInput() {
    messageInput.style.height = "auto";
    messageInput.style.height = `${Math.min(messageInput.scrollHeight, 180)}px`;
}

sendButton.addEventListener("click", () => sendMessage());
stopButton.addEventListener("click", stopGeneration);

messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener("input", resizeInput);

newChatButton.addEventListener("click", async () => {
    if (isSending) {
        showToast("Stop the current response before starting a new conversation.");
        return;
    }
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
        if (!isSending) createSession().catch(error => showToast(error.message));
    }
    if (event.key === "Escape") {
        if (isSending) stopGeneration();
        else setSidebarOpen(false);
    }
});

async function initializeApp() {
    try {
        await loadSessions();
        const data = await apiRequest("/api/sessions");
        if (data.sessions.length > 0) await openSession(data.sessions[0].session_id);
    } catch (error) {
        console.error("Initialization failed:", error);
        showToast("Could not connect to the backend. Check that FastAPI is running.");
    }
}

initializeApp();
