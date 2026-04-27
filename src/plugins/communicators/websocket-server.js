const WebSocket = require('ws');
const EventEmitter = require('events');
const http = require('http');

class WebSocketCommunicator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      port: options.port || 8080,
      host: options.host || 'localhost',
      throttleInterval: options.throttleInterval || 100,
      maxMessageSize: options.maxMessageSize || 64 * 1024
    };
    
    this.wss = null;
    this.httpServer = null;
    this.isRunning = false;
    this.clients = new Set();
    
    this._lastBroadcastTime = 0;
    this._pendingMessages = [];
    this._broadcastTimer = null;
  }

  async start(httpServerInstance = null) {
    if (this.isRunning) {
      throw new Error('WebSocket server is already running');
    }
    
    if (httpServerInstance) {
      this.wss = new WebSocket.Server({ 
        server: httpServerInstance,
        clientTracking: true
      });
    } else {
      this.httpServer = http.createServer();
      this.wss = new WebSocket.Server({ 
        server: this.httpServer,
        clientTracking: true
      });
      
      return new Promise((resolve, reject) => {
        this.httpServer.listen(this.options.port, (error) => {
          if (error) {
            reject(error);
            return;
          }
          
          this._setupEventHandlers();
          this.isRunning = true;
          this.emit('started', { port: this.options.port });
          resolve({ port: this.options.port });
        });
      });
    }
    
    this._setupEventHandlers();
    this.isRunning = true;
    this.emit('started', { port: this.options.port });
    return { port: this.options.port };
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    if (this._broadcastTimer) {
      clearTimeout(this._broadcastTimer);
      this._broadcastTimer = null;
    }
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    this.clients.clear();
    
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer.close(() => {
          this.isRunning = false;
          this.emit('stopped');
          resolve();
        });
      });
    }
    
    this.isRunning = false;
    this.emit('stopped');
  }

  _setupEventHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      console.log(`[WebSocket] Client connected from ${clientIP}`);
      
      this.clients.add(ws);
      this.emit('clientConnected', {
        client: ws,
        clientIP,
        totalClients: this.clients.size
      });
      
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: Date.now(),
        message: 'Welcome to SysScan-Pro WebSocket server'
      }));
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.emit('message', { client: ws, data });
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
        this.clients.delete(ws);
        this.emit('clientDisconnected', {
          totalClients: this.clients.size
        });
      });
      
      ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error.message);
        this.clients.delete(ws);
      });
    });
  }

  broadcast(message, throttle = true) {
    if (!this.isRunning || this.clients.size === 0) {
      return;
    }
    
    const messageStr = typeof message === 'string' 
      ? message 
      : JSON.stringify(message);
    
    if (messageStr.length > this.options.maxMessageSize) {
      console.warn('[WebSocket] Message too large, skipping broadcast');
      return;
    }
    
    if (!throttle) {
      this._doBroadcast(messageStr);
      return;
    }
    
    this._pendingMessages.push(messageStr);
    
    const now = Date.now();
    const elapsed = now - this._lastBroadcastTime;
    
    if (elapsed >= this.options.throttleInterval) {
      this._flushMessages();
    } else if (!this._broadcastTimer) {
      this._broadcastTimer = setTimeout(() => {
        this._flushMessages();
        this._broadcastTimer = null;
      }, this.options.throttleInterval - elapsed);
    }
  }

  _flushMessages() {
    if (this._pendingMessages.length === 0) {
      return;
    }
    
    const latestMessage = this._pendingMessages[this._pendingMessages.length - 1];
    this._doBroadcast(latestMessage);
    
    this._pendingMessages = [];
    this._lastBroadcastTime = Date.now();
  }

  _doBroadcast(messageStr) {
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('[WebSocket] Send error:', error.message);
        }
      }
    }
  }

  sendProgress(progress) {
    this.broadcast({
      type: 'progress',
      data: progress,
      timestamp: Date.now()
    });
  }

  sendStart(data) {
    this.broadcast({
      type: 'start',
      data: data,
      timestamp: Date.now()
    }, false);
  }

  sendComplete(result) {
    this.broadcast({
      type: 'complete',
      data: result,
      timestamp: Date.now()
    }, false);
  }

  sendError(error) {
    this.broadcast({
      type: 'error',
      data: error,
      timestamp: Date.now()
    }, false);
  }

  getClientCount() {
    return this.clients.size;
  }

  isActive() {
    return this.isRunning && this.clients.size > 0;
  }

  getProgressReporter() {
    return {
      report: (progress) => {
        this.sendProgress(progress);
      }
    };
  }
}

module.exports = WebSocketCommunicator;
