const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const EventEmitter = require('events');

class WebServer extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      port: options.port || 3000,
      webSocketPort: options.webSocketPort || 8080,
      publicPath: options.publicPath || path.join(__dirname, '../../public'),
      enableCors: options.enableCors !== false
    };
    
    this.app = null;
    this.httpServer = null;
    this.wss = null;
    this.isRunning = false;
    this.clients = new Set();
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }
    
    this.app = express();
    
    if (this.options.enableCors) {
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
      });
    }
    
    this.app.use(express.json());
    this.app.use(express.static(this.options.publicPath));
    
    this._setupRoutes();
    
    this.httpServer = http.createServer(this.app);
    
    this.wss = new WebSocket.Server({ 
      server: this.httpServer,
      clientTracking: true
    });
    
    this._setupWebSocket();
    
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.options.port, (error) => {
        if (error) {
          reject(error);
          return;
        }
        
        this.isRunning = true;
        this.emit('started', {
          port: this.options.port,
          webSocketPort: this.options.port
        });
        
        resolve({
          port: this.options.port,
          webSocketPort: this.options.port
        });
      });
    });
  }

  async stop() {
    if (!this.isRunning) {
      return;
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

  _setupRoutes() {
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        isRunning: this.isRunning,
        clientCount: this.clients.size
      });
    });
    
    this.app.get('/api/status', (req, res) => {
      res.json({
        isRunning: this.isRunning,
        clientCount: this.clients.size,
        port: this.options.port,
        timestamp: Date.now()
      });
    });
  }

  _setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('[WebSocket] New client connected');
      this.clients.add(ws);
      
      this.emit('clientConnected', {
        client: ws,
        totalClients: this.clients.size
      });
      
      ws.send(JSON.stringify({
        type: 'welcome',
        timestamp: Date.now(),
        message: 'Connected to SysScan-Pro WebSocket server'
      }));
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this._handleClientMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid JSON format'
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

  _handleClientMessage(ws, data) {
    this.emit('message', {
      client: ws,
      data
    });
    
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        break;
        
      case 'getStatus':
        ws.send(JSON.stringify({
          type: 'status',
          data: {
            isRunning: this.isRunning,
            clientCount: this.clients.size
          }
        }));
        break;
    }
  }

  broadcast(message) {
    const messageStr = typeof message === 'string' 
      ? message 
      : JSON.stringify(message);
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('[WebSocket] Broadcast error:', error.message);
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

  sendComplete(result) {
    this.broadcast({
      type: 'complete',
      data: result,
      timestamp: Date.now()
    });
  }

  sendError(error) {
    this.broadcast({
      type: 'error',
      data: error,
      timestamp: Date.now()
    });
  }

  sendStart(data) {
    this.broadcast({
      type: 'start',
      data: data,
      timestamp: Date.now()
    });
  }

  getClientCount() {
    return this.clients.size;
  }

  getPort() {
    return this.options.port;
  }
}

module.exports = WebServer;
