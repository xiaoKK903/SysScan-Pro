const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const Scanner = require('./core/scanner');
const ProgressTracker = require('./core/progress');
const WebSocketCommunicator = require('./plugins/communicators/websocket-server');
const config = require('../config/default');

class SysScanPro {
  constructor(options = {}) {
    this.options = {
      port: options.port || 3000,
      ...options
    };
    
    this.app = null;
    this.httpServer = null;
    this.wss = null;
    this.scanner = null;
    this.progressTracker = null;
    this.wsCommunicator = null;
    
    this.isRunning = false;
    this.activeScan = null;
  }

  async initialize() {
    console.log('[SysScan-Pro] Initializing...');
    
    this.app = express();
    
    this._setupMiddleware();
    this._setupRoutes();
    
    this.httpServer = http.createServer(this.app);
    
    this.wss = new WebSocket.Server({ 
      server: this.httpServer,
      clientTracking: true
    });
    
    this.progressTracker = new ProgressTracker({
      throttleInterval: 100,
      maxBufferSize: 1000
    });
    
    this.wsCommunicator = new WebSocketCommunicator({
      port: this.options.port,
      throttleInterval: 100
    });
    
    await this.wsCommunicator.start(this.httpServer);
    
    this._setupWebSocketHandlers();
    this._setupEventListeners();
    
    console.log('[SysScan-Pro] Initialized successfully');
  }

  _setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      
      next();
    });
    
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  _setupRoutes() {
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        isScanning: this.isRunning,
        activeClients: this.wss ? this.wss.clients.size : 0
      });
    });
    
    this.app.get('/api/status', (req, res) => {
      res.json({
        isScanning: this.isRunning,
        scanConfig: this.activeScan ? this.activeScan.config : null,
        activeClients: this.wss ? this.wss.clients.size : 0,
        stats: this.progressTracker ? this.progressTracker.getStats() : null
      });
    });
    
    this.app.post('/api/scan', async (req, res) => {
      try {
        const { path: scanPath, ...options } = req.body;
        
        if (!scanPath) {
          return res.status(400).json({ error: 'Path is required' });
        }
        
        if (this.isRunning) {
          return res.status(400).json({ error: 'Scan already in progress' });
        }
        
        await this.startScan(scanPath, options);
        
        res.json({ 
          success: true, 
          message: 'Scan started',
          path: scanPath
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    this.app.post('/api/stop', (req, res) => {
      if (!this.isRunning) {
        return res.status(400).json({ error: 'No scan in progress' });
      }
      
      this.stopScan();
      res.json({ success: true, message: 'Scan stopped' });
    });
    
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });
  }

  _setupWebSocketHandlers() {
    this.wss.on('connection', (ws, req) => {
      const clientIP = req.socket.remoteAddress;
      console.log(`[WebSocket] Client connected: ${clientIP}`);
      
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: Date.now(),
        message: 'Welcome to SysScan-Pro',
        isScanning: this.isRunning
      }));
      
      if (this.isRunning && this.progressTracker) {
        ws.send(JSON.stringify({
          type: 'progress',
          data: this.progressTracker.getStats(),
          timestamp: Date.now()
        }));
      }
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this._handleClientMessage(ws, data);
        } catch (error) {
          console.error('[WebSocket] Message parse error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
      });
      
      ws.on('error', (error) => {
        console.error('[WebSocket] Error:', error);
      });
    });
  }

  async _handleClientMessage(ws, data) {
    console.log(`[WebSocket] Received message: ${data.type}`);
    
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        break;
        
      case 'startScan':
        if (this.isRunning) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Scan already in progress'
          }));
          return;
        }
        
        try {
          const scanConfig = data.data || {};
          const scanPath = scanConfig.path || 'C:\\';
          
          await this.startScan(scanPath, scanConfig);
          
          ws.send(JSON.stringify({
            type: 'scanStarted',
            data: { path: scanPath },
            timestamp: Date.now()
          }));
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            message: error.message
          }));
        }
        break;
        
      case 'stopScan':
        if (!this.isRunning) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'No scan in progress'
          }));
          return;
        }
        
        this.stopScan();
        
        ws.send(JSON.stringify({
          type: 'scanStopped',
          timestamp: Date.now()
        }));
        break;
        
      case 'getStatus':
        ws.send(JSON.stringify({
          type: 'status',
          data: {
            isScanning: this.isRunning,
            stats: this.progressTracker ? this.progressTracker.getStats() : null
          },
          timestamp: Date.now()
        }));
        break;
        
      default:
        console.log(`[WebSocket] Unknown message type: ${data.type}`);
    }
  }

  _setupEventListeners() {
    if (!this.progressTracker) return;
    
    this.progressTracker.on('start', (data) => {
      console.log('[Progress] Tracking started');
      this._broadcast({
        type: 'start',
        data: {
          path: this.activeScan ? this.activeScan.path : '',
          ...data
        },
        timestamp: Date.now()
      });
    });
    
    this.progressTracker.on('progress', (progress) => {
      this._broadcast({
        type: 'progress',
        data: progress,
        timestamp: Date.now()
      });
    });
    
    this.progressTracker.on('complete', (result) => {
      console.log('[Progress] Scan completed');
      this._broadcast({
        type: 'complete',
        data: result,
        timestamp: Date.now()
      });
    });
    
    this.progressTracker.on('stop', (data) => {
      console.log('[Progress] Tracking stopped');
      this._broadcast({
        type: 'stopped',
        data: data.stats,
        timestamp: Date.now()
      });
    });
  }

  _broadcast(message) {
    if (!this.wss) return;
    
    const messageStr = typeof message === 'string' 
      ? message 
      : JSON.stringify(message);
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error('[WebSocket] Broadcast error:', error);
        }
      }
    });
  }

  async startScan(scanPath, options = {}) {
    if (this.isRunning) {
      throw new Error('Scan already in progress');
    }
    
    console.log(`[SysScan-Pro] Starting scan: ${scanPath}`);
    
    this.isRunning = true;
    this.activeScan = {
      path: scanPath,
      config: options,
      startTime: Date.now()
    };
    
    const scannerOptions = {
      showHidden: options.showHidden || config.scan.showHidden,
      maxDepth: options.maxDepth || config.scan.maxDepth,
      excludeDirs: config.scan.excludeDirs,
      maxConcurrency: 30
    };
    
    this.scanner = new Scanner(scannerOptions);
    
    if (this.progressTracker) {
      this.progressTracker.reset();
      this.progressTracker.bindToScanner(this.scanner);
    }
    
    setImmediate(async () => {
      try {
        const result = await this.scanner.scan(scanPath);
        console.log(`[SysScan-Pro] Scan completed: ${result.totalFiles} files, ${result.formattedSize}`);
        
        this.isRunning = false;
        this.activeScan = null;
      } catch (error) {
        console.error('[SysScan-Pro] Scan error:', error);
        this.isRunning = false;
        this.activeScan = null;
        
        this._broadcast({
          type: 'error',
          data: {
            type: 'scan',
            message: error.message
          },
          timestamp: Date.now()
        });
      }
    });
    
    return true;
  }

  stopScan() {
    if (!this.isRunning) {
      return false;
    }
    
    console.log('[SysScan-Pro] Stopping scan...');
    
    if (this.scanner) {
      this.scanner.stop();
    }
    
    if (this.progressTracker) {
      this.progressTracker.stop();
    }
    
    this.isRunning = false;
    
    return true;
  }

  async start() {
    await this.initialize();
    
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.options.port, (error) => {
        if (error) {
          reject(error);
          return;
        }
        
        console.log(`[SysScan-Pro] Server running on port ${this.options.port}`);
        console.log(`[SysScan-Pro] Web interface: http://localhost:${this.options.port}`);
        console.log(`[SysScan-Pro] WebSocket: ws://localhost:${this.options.port}`);
        
        resolve({
          port: this.options.port,
          url: `http://localhost:${this.options.port}`
        });
      });
    });
  }

  async stop() {
    console.log('[SysScan-Pro] Shutting down...');
    
    if (this.isRunning) {
      this.stopScan();
    }
    
    if (this.wsCommunicator) {
      await this.wsCommunicator.stop();
    }
    
    if (this.wss) {
      this.wss.close();
    }
    
    if (this.httpServer) {
      return new Promise((resolve) => {
        this.httpServer.close(() => {
          console.log('[SysScan-Pro] Server stopped');
          resolve();
        });
      });
    }
  }
}

module.exports = SysScanPro;

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const app = new SysScanPro({ port });
  
  app.start().catch((error) => {
    console.error('[SysScan-Pro] Failed to start:', error);
    process.exit(1);
  });
  
  process.on('SIGINT', async () => {
    console.log('\n[SysScan-Pro] Received SIGINT, shutting down...');
    await app.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n[SysScan-Pro] Received SIGTERM, shutting down...');
    await app.stop();
    process.exit(0);
  });
}
