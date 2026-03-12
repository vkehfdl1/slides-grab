// UI iframe — WebSocket client connecting to slides-grab editor server

const serverUrlInput = document.getElementById('server-url') as HTMLInputElement;
const statusDot = document.getElementById('status-dot')!;
const statusText = document.getElementById('status-text')!;
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement;
const btnDisconnect = document.getElementById('btn-disconnect') as HTMLButtonElement;
const progressDiv = document.getElementById('progress')!;
const progressFill = document.getElementById('progress-fill')!;
const progressText = document.getElementById('progress-text')!;
const logDiv = document.getElementById('log')!;

let ws: WebSocket | null = null;
let pendingSlides: Array<{ name: string; svg: string }> = [];

serverUrlInput.value = 'localhost:3456';

function log(message: string, type: '' | 'error' | 'success' = '') {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (type ? ` ${type}` : '');
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logDiv.prepend(entry);

  // Keep log manageable
  while (logDiv.children.length > 50) {
    logDiv.removeChild(logDiv.lastChild!);
  }
}

function setConnected(connected: boolean) {
  if (connected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected';
    btnConnect.style.display = 'none';
    btnDisconnect.style.display = '';
    serverUrlInput.disabled = true;
  } else {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Disconnected';
    btnConnect.style.display = '';
    btnConnect.disabled = false;
    btnDisconnect.style.display = 'none';
    serverUrlInput.disabled = false;
  }
}

function connect() {
  const url = serverUrlInput.value.trim();
  if (!url) return;

  btnConnect.disabled = true;
  statusDot.className = 'status-dot';
  statusText.textContent = 'Connecting...';
  log(`Connecting to ws://${url}/figma-ws ...`);

  try {
    ws = new WebSocket(`ws://${url}/figma-ws`);
  } catch (err) {
    log(`Connection failed: ${err}`, 'error');
    setConnected(false);
    return;
  }

  ws.onopen = () => {
    setConnected(true);
    log('Connected to editor server.', 'success');
    pendingSlides = [];
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      if (msg.type === 'slide') {
        pendingSlides.push({ name: msg.name, svg: msg.svg });
        const pct = Math.round((msg.current / msg.total) * 100);
        progressDiv.classList.add('active');
        progressFill.style.width = `${pct}%`;
        progressText.textContent = `Receiving: ${msg.current} / ${msg.total} — ${msg.name}`;
        log(`Received slide: ${msg.name} (${msg.current}/${msg.total})`);
      }

      if (msg.type === 'done') {
        log(`All ${msg.total} slides received. Creating in Figma...`, 'success');
        progressText.textContent = `Creating ${pendingSlides.length} slides in Figma...`;

        // Send to Figma sandbox
        parent.postMessage({
          pluginMessage: {
            type: 'create-slides',
            slides: pendingSlides,
          },
        }, '*');
      }
    } catch (err) {
      log(`Parse error: ${err}`, 'error');
    }
  };

  ws.onclose = () => {
    setConnected(false);
    log('Connection closed.');
    ws = null;
  };

  ws.onerror = (err) => {
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Connection error';
    log(`WebSocket error`, 'error');
  };
}

function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }
  setConnected(false);
}

// Listen for messages from Figma sandbox
window.onmessage = (event) => {
  const msg = event.data?.pluginMessage;
  if (!msg) return;

  if (msg.type === 'figma-progress') {
    const pct = Math.round((msg.current / msg.total) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `Creating in Figma: ${msg.current} / ${msg.total}`;
  }

  if (msg.type === 'figma-done') {
    progressFill.style.width = '100%';
    progressText.textContent = `Done! Created ${msg.count} slides.`;
    log(`Created ${msg.count} slides in Figma.`, 'success');
    pendingSlides = [];
  }

  if (msg.type === 'figma-error') {
    log(msg.message, 'error');
  }
};

// Event bindings
btnConnect.addEventListener('click', connect);
btnDisconnect.addEventListener('click', disconnect);
serverUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connect();
});
