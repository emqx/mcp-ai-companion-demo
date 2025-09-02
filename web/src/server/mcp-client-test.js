#!/usr/bin/env node

const mqtt = require('mqtt');
const chalk = require('chalk');

const DEBUG = process.env.DEBUG === 'true';

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

class McpMqttClient {
  constructor(options = {}) {
    this.clientId = options.clientId || `mcp-test-client-${Math.random().toString(16).substring(2, 10)}`;
    this.brokerUrl = options.brokerUrl || 'ws://localhost:8083/mqtt';
    this.mqttClient = null;
    this.isConnected = false;
    this.servers = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      console.log(chalk.blue(`🔌 [MCP Client] Connecting to ${this.brokerUrl}...`));
      
      this.mqttClient = mqtt.connect(this.brokerUrl, {
        clientId: this.clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
        protocolVersion: 5,
        properties: {
          userProperties: {
            'MCP-COMPONENT-TYPE': 'mcp-client',
            'MCP-META': JSON.stringify({
              version: '1.0.0',
              implementation: 'mcp-test-client',
              location: 'nodejs'
            })
          }
        }
      });

      this.mqttClient.on('connect', async () => {
        this.isConnected = true;
        console.log(chalk.green(`✅ [MCP Client] Connected with ID: ${this.clientId}`));
        
        // Subscribe to server presence notifications
        await this.subscribe('$mcp-server/presence/+/+');
        console.log(chalk.cyan('📡 [MCP Client] Subscribed to server presence notifications'));
        
        resolve();
      });

      this.mqttClient.on('error', (error) => {
        console.error(chalk.red('❌ [MCP Client] Connection error:'), error);
        reject(error);
      });

      this.mqttClient.on('message', (topic, payload) => {
        this.handleMessage(topic, payload.toString());
      });
    });
  }

  async subscribe(topic, qos = 0) {
    return new Promise((resolve, reject) => {
      this.mqttClient.subscribe(topic, { qos }, (error, granted) => {
        if (error) {
          reject(error);
        } else {
          debugLog(chalk.gray(`📡 Subscribed to: ${topic}`));
          resolve(granted);
        }
      });
    });
  }

  async publish(topic, message, options = {}) {
    return new Promise((resolve, reject) => {
      this.mqttClient.publish(topic, message, {
        qos: options.qos || 0,
        retain: options.retain || false,
        properties: {
          userProperties: {
            'MCP-MQTT-CLIENT-ID': this.clientId
          }
        }
      }, (error) => {
        if (error) {
          reject(error);
        } else {
          console.debug(chalk.gray(`📤 Published to ${topic}`));
          resolve();
        }
      });
    });
  }

  handleMessage(topic, payload) {
    console.debug(chalk.gray(`📥 Received: ${topic}`));
    
    try {
      const data = JSON.parse(payload);
      
      if (topic.startsWith('$mcp-server/presence/')) {
        this.handleServerPresence(topic, data);
      } else if (topic.startsWith(`$mcp-rpc/${this.clientId}/`)) {
        this.handleRpcResponse(topic, data);
      }
    } catch (error) {
      console.error('[MCP Client] Failed to parse message:', error);
    }
  }

  handleServerPresence(topic, data) {
    if (data.method === 'notifications/server/online') {
      const topicParts = topic.split('/');
      const serverId = topicParts[2];
      const serverName = topicParts[3];
      
      console.log(chalk.green(`🎯 [MCP Client] Server discovered: ${chalk.bold(serverName)} (${serverId})`));
      if (data.params?.description) {
        console.log(chalk.gray(`   Description: ${data.params.description}`));
      }

      this.servers.set(`${serverId}/${serverName}`, {
        serverId,
        serverName,
        description: data.params?.description
      });
      
      // Auto-initialize with discovered server
      this.initializeServer(serverId, serverName);
    }
  }

  handleRpcResponse(topic, data) {
    debugLog(chalk.gray('📨 RPC Response:'), JSON.stringify(data, null, 2));
    
    if (data.result) {
      if (data.result.serverInfo) {
        console.log(chalk.green('🤝 [MCP Client] Server initialized:'), data.result.serverInfo);
        
        // Extract server info from topic
        const topicParts = topic.split('/');
        const serverId = topicParts[2];
        const serverName = topicParts[3];
        
        console.debug(chalk.gray(`📋 Requesting tools list...`));
        // Request tools list after successful initialization
        this.listTools(serverId, serverName);
      } else if (data.result.tools) {
        console.log(chalk.yellow('\n🔧 Available Tools:'));
        data.result.tools.forEach((tool, index) => {
          console.log(chalk.yellow(`   ${index + 1}. ${chalk.bold(tool.name)} - ${tool.description}`));
        });
        
        console.log(chalk.magenta('\n🎮 === Manual Tool Testing ==='));
        console.log(chalk.cyan('Available commands:'));
        console.log(chalk.white('  📹 camera_on     - Enable camera'));
        console.log(chalk.white('  📹 camera_off    - Disable camera'));  
        console.log(chalk.white('  😊 emotion <name> - Change emotion (happy, sad, angry, etc.)'));
        console.log(chalk.white('  📸 take_photo    - Take a photo from video stream'));
        console.log(chalk.white('  🚪 quit          - Exit test client\n'));
        
        // Extract server info for manual tool calls
        const topicParts = topic.split('/');
        const serverId = topicParts[2];
        const serverName = topicParts[3];
        this.currentServer = { serverId, serverName };
        
        // Setup manual input
        this.setupManualInput();
      } else {
        console.log(chalk.green('✅ [MCP Client] Tool call result:'), data.result);
      }
    }
    
    if (data.error) {
      console.error(chalk.red('❌ [MCP Client] RPC Error:'), data.error);
    }
  }

  async initializeServer(serverId, serverName) {
    // Subscribe to response topic FIRST
    const responseTopic = `$mcp-rpc/${this.clientId}/${serverId}/${serverName}`;
    await this.subscribe(responseTopic);
    console.debug(chalk.gray(`📡 Subscribed to response topic`));
    
    const request = {
      jsonrpc: '2.0',
      id: Math.random().toString(16).substring(2, 10),
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'mcp-test-client',
          version: '1.0.0'
        }
      }
    };

    const topic = `$mcp-server/${serverId}/${serverName}`;
    await this.publish(topic, JSON.stringify(request));
    
    console.log(chalk.blue(`🤝 [MCP Client] Sent initialize request to ${chalk.bold(serverName)}`));
  }

  async listTools(serverId, serverName) {
    const request = {
      jsonrpc: '2.0',
      id: Math.random().toString(16).substring(2, 10),
      method: 'tools/list',
      params: {}
    };

    const topic = `$mcp-rpc/${this.clientId}/${serverId}/${serverName}`;
    await this.publish(topic, JSON.stringify(request));
    
    console.log(chalk.yellow(`🔧 [MCP Client] Requested tools list from ${chalk.bold(serverName)}`));
  }

  setupManualInput() {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const promptUser = () => {
      rl.question('> ', async (input) => {
        const command = input.trim().toLowerCase();
        
        if (command === 'quit') {
          console.log(chalk.yellow('👋 [Test] Goodbye!'));
          rl.close();
          this.disconnect();
          process.exit(0);
        } else if (command === 'camera_on') {
          await this.callTool('control_camera', { enabled: true });
        } else if (command === 'camera_off') {
          await this.callTool('control_camera', { enabled: false });
        } else if (command.startsWith('emotion ')) {
          const emotion = command.split(' ')[1];
          await this.callTool('change_emotion', { emotion });
        } else if (command === 'take_photo') {
          await this.callTool('take_photo', { source: 'remote', quality: 0.9 });
        } else {
          console.log(chalk.red('❓ Unknown command. Try: camera_on, camera_off, emotion <emotion>, take_photo, quit'));
        }
        
        promptUser();
      });
    };

    promptUser();
  }

  async callTool(toolName, args) {
    if (!this.currentServer) {
      console.log(chalk.red('❌ [MCP Client] No server available'));
      return;
    }

    const { serverId, serverName } = this.currentServer;
    
    const request = {
      jsonrpc: '2.0',
      id: Math.random().toString(16).substring(2, 10),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const topic = `$mcp-rpc/${this.clientId}/${serverId}/${serverName}`;
    await this.publish(topic, JSON.stringify(request));
    
    console.log(chalk.magenta(`🛠️  [MCP Client] Called tool: ${chalk.bold(toolName)}`), chalk.gray('with args:'), args);
  }

  disconnect() {
    if (this.mqttClient) {
      this.mqttClient.end();
      this.isConnected = false;
      console.log(chalk.gray('🔌 [MCP Client] Disconnected'));
    }
  }
}

// Test runner
async function runTest() {
  console.log(chalk.bold.blue('\n🚀 === MCP Client Test Started ===\n'));
  
  const client = new McpMqttClient({
    brokerUrl: 'ws://localhost:8083/mqtt'
  });

  try {
    await client.connect();
    
    console.log(chalk.green('\n✅ [Test] MCP Client connected, waiting for server discovery...'));
    console.log(chalk.yellow('💡 [Test] Make sure the Web UI is running to see the interaction!\n'));
    
    // Keep the client running to receive messages
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n👋 [Test] Shutting down...'));
      client.disconnect();
      process.exit(0);
    });
    
  } catch (error) {
    console.error(chalk.red('❌ [Test] Failed to start test client:'), error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTest();
}

module.exports = { McpMqttClient };