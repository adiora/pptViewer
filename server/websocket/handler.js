const WebSocket = require('ws');
const config = require('../config');

const ALLOWED_ACTIONS = ['NEXT_SLIDE', 'PREV_SLIDE', 'PLAY_VIDEO'];
const MAX_MESSAGE_BYTES = 1024; // 1 KB max message payload

/**
 * Initialize WebSocket server attached to HTTP server
 * @param {Object} server - HTTP Server instance
 * @param {Object} sessionManager - SessionManager instance
 */
function initWebSocket(server, sessionManager) {
  const wss = new WebSocket.Server({ noServer: true });

  // Handle HTTP Upgrade request for /ws
  server.on('upgrade', (request, socket, head) => {
    // Use WHATWG URL API to avoid url.parse deprecation warning
    const hostHeader = request.headers.host || 'localhost:3000';
    const parsedUrl = new URL(request.url, `http://${hostHeader}`);

    if (parsedUrl.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const code = (parsedUrl.searchParams.get('code') || '').trim().toUpperCase();
    const role = (parsedUrl.searchParams.get('role') || '').trim().toLowerCase();

    // 1. Validate Code
    const session = sessionManager.getSession(code);
    if (!session) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4001, 'Invalid or expired session code');
      });
      return;
    }

    // 2. Validate Role
    if (role !== 'presenter' && role !== 'controller') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4002, 'Invalid role');
      });
      return;
    }

    // 3. Slot Availability Checks
    if (role === 'presenter' && session.presenterWs && session.presenterWs.readyState === WebSocket.OPEN) {
      // If existing presenter is stale (missed heartbeat), terminate it
      if (session.presenterWs.isAlive === false) {
        session.presenterWs.terminate();
        session.presenterWs = null;
      } else {
        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.close(4003, 'Presenter already connected');
        });
        return;
      }
    }

    if (role === 'controller' && session.controllerWs.length >= config.maxControllersPerSession) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.close(4004, 'Maximum controllers reached');
      });
      return;
    }

    // Complete Upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, session, role);
    });
  });

  // Handle Client Connection
  wss.on('connection', (ws, request, session, role) => {
    ws.isAlive = true;
    ws.role = role;
    ws.sessionCode = session.code;

    console.log(`[WS] ${role.toUpperCase()} connected to session ${session.code}`);

    // Register connection in session store
    if (role === 'presenter') {
      session.presenterWs = ws;
    } else {
      session.controllerWs.push(ws);
    }

    // 1. Send JOINED message to client
    sendJson(ws, {
      type: 'JOINED',
      role: role,
      slideCount: session.pageCount,
      currentSlide: session.currentSlide || 1,
      peers: {
        presenter: !!(session.presenterWs && session.presenterWs.readyState === WebSocket.OPEN),
        controllerCount: session.controllerWs.length
      }
    });

    // 2. Notify peers
    if (role === 'presenter') {
      broadcastToControllers(session, {
        type: 'PEER_CONNECTED',
        role: 'presenter',
        controllerCount: session.controllerWs.length
      });
    } else {
      if (session.presenterWs && session.presenterWs.readyState === WebSocket.OPEN) {
        sendJson(session.presenterWs, {
          type: 'PEER_CONNECTED',
          role: 'controller',
          controllerCount: session.controllerWs.length
        });
      }
    }

    // Pong listener for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
      if (ws.pongTimeout) clearTimeout(ws.pongTimeout);
    });

    // Incoming Message Handler
    ws.on('message', (message) => {
      // 1 KB Payload Limit Check
      if (message.length > MAX_MESSAGE_BYTES) {
        console.warn(`[WS] Oversized message (${message.length} bytes) from ${role} in ${session.code}`);
        return sendJson(ws, { type: 'ERROR', message: 'Payload size exceeds limit' });
      }

      try {
        const data = JSON.parse(message.toString());
        handleClientMessage(ws, session, role, data);
      } catch (err) {
        console.warn(`[WS] Invalid JSON from ${role} in ${session.code}:`, message.toString());
        sendJson(ws, { type: 'ERROR', message: 'Malformed JSON payload' });
      }
    });

    // Disconnection Handler
    ws.on('close', () => {
      console.log(`[WS] ${role.toUpperCase()} disconnected from session ${session.code}`);

      if (role === 'presenter') {
        session.presenterWs = null;
        broadcastToControllers(session, {
          type: 'PEER_DISCONNECTED',
          role: 'presenter',
          controllerCount: session.controllerWs.length
        });
      } else {
        session.controllerWs = session.controllerWs.filter(c => c !== ws);
        if (session.presenterWs && session.presenterWs.readyState === WebSocket.OPEN) {
          sendJson(session.presenterWs, {
            type: 'PEER_DISCONNECTED',
            role: 'controller',
            controllerCount: session.controllerWs.length
          });
        }
      }
    });
  });

  // ── Message Dispatch Logic ──
  function handleClientMessage(ws, session, role, msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'COMMAND') {
      if (role !== 'controller') {
        return sendJson(ws, { type: 'ERROR', message: 'Only controllers can send commands' });
      }

      if (!ALLOWED_ACTIONS.includes(msg.action)) {
        return sendJson(ws, { type: 'ERROR', message: `Invalid command action: ${msg.action}` });
      }

      if (!session.presenterWs || session.presenterWs.readyState !== WebSocket.OPEN) {
        return sendJson(ws, { type: 'ERROR', message: 'No active presenter connected to session' });
      }

      // Forward command to presenter
      sendJson(session.presenterWs, {
        type: 'COMMAND',
        action: msg.action
      });
      console.log(`[WS] Command ${msg.action} relayed to presenter in ${session.code}`);
    }

    else if (msg.type === 'HEARTBEAT') {
      // No-op: acknowledge heartbeat from Flutter clients
      return;
    }

    else if (msg.type === 'SLIDE_UPDATE') {
      if (role !== 'presenter') {
        return sendJson(ws, { type: 'ERROR', message: 'Only presenter can send slide updates' });
      }

      const current = parseInt(msg.currentSlide, 10);
      const total = parseInt(msg.totalSlides, 10);

      if (isNaN(current) || current < 1) return;

      session.currentSlide = current;

      // Broadcast SLIDE_SYNC to all connected controllers
      broadcastToControllers(session, {
        type: 'SLIDE_SYNC',
        currentSlide: current,
        totalSlides: total || session.pageCount
      });
    }
  }

  // ── Heartbeat Ping/Pong Loop ──
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log(`[WS] Terminating inactive connection (${ws.role} in ${ws.sessionCode})`);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
      // Close if no pong within 10 seconds
      ws.pongTimeout = setTimeout(() => {
        if (ws.isAlive === false) {
          console.log(`[WS] No pong received within 10s, terminating (${ws.role} in ${ws.sessionCode})`);
          ws.terminate();
        }
      }, 10000);
    });
  }, config.wsHeartbeatInterval);

  wss.on('close', () => {
    clearInterval(interval);
  });
}

function sendJson(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToControllers(session, payload) {
  if (session.controllerWs && session.controllerWs.length > 0) {
    const jsonStr = JSON.stringify(payload);
    session.controllerWs.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(jsonStr);
      }
    });
  }
}

module.exports = {
  initWebSocket
};
