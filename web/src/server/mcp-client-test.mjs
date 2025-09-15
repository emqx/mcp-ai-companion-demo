#!/usr/bin/env node

import { McpMqttClient } from '@emqx-ai/mcp-mqtt-sdk'
import chalk from 'chalk'
import readline from 'readline'

class McpTestClient {
  constructor(options = {}) {
    this.brokerUrl = options.brokerUrl || 'ws://localhost:8083/mqtt'
    this.username = options.username || 'emqx-mcp-webrtc-web-ui'
    this.password = options.password || 'public'
    this.client = null
    this.isConnected = false
    this.servers = new Map()
    this.currentServer = null
  }

  async connect() {
    console.log(chalk.blue(`🔌 [MCP Client] Connecting to ${this.brokerUrl}...`))

    this.client = new McpMqttClient({
      host: this.brokerUrl,
      username: this.username,
      password: this.password,
      name: 'MCP Test Client',
      version: '1.0.0',
    })

    // Setup event handlers
    this.client.on('connected', () => {
      this.isConnected = true
      console.log(chalk.green(`✅ [MCP Client] Connected`))
    })

    this.client.on('error', (error) => {
      console.error(chalk.red('❌ [MCP Client] Error:'), error)
    })

    this.client.on('serverDiscovered', async (server) => {
      console.log(chalk.green(`🎯 [MCP Client] Server discovered: ${chalk.bold(server.name)} (ID: ${server.serverId})`))
      if (server.description) {
        console.log(chalk.gray(`   Description: ${server.description}`))
      }

      this.servers.set(server.serverId, server)

      try {
        // Initialize connection to the server
        await this.client.initializeServer(server.serverId)
        console.log(chalk.green(`🤝 [MCP Client] Connected to server: ${server.name}`))

        // List available tools
        const tools = await this.client.listTools(server.serverId)
        console.log(chalk.yellow('\n🔧 Available Tools:'))
        tools.forEach((tool, index) => {
          console.log(chalk.yellow(`   ${index + 1}. ${chalk.bold(tool.name)} - ${tool.description}`))
        })

        // Set as current server for manual testing
        this.currentServer = server

        this.showManualCommands()
        this.setupManualInput()
      } catch (error) {
        console.error(chalk.red(`❌ Failed to initialize server ${server.name}:`), error)
      }
    })

    this.client.on('serverDisconnected', (serverId) => {
      const server = this.servers.get(serverId)
      if (server) {
        console.log(chalk.red(`🔻 [MCP Client] Server offline: ${chalk.bold(server.name)} (${serverId})`))
        this.servers.delete(serverId)
      }
    })

    // Connect to MQTT broker
    await this.client.connect()
  }

  showManualCommands() {
    console.log(chalk.magenta('\n🎮 === Manual Tool Testing ==='))
    console.log(chalk.cyan('Available commands:'))
    console.log(chalk.white('  📹 camera_on       - Enable camera'))
    console.log(chalk.white('  📹 camera_off      - Disable camera'))
    console.log(chalk.white('  😊 emotion <name>  - Change emotion (happy, sad, angry, etc.)'))
    console.log(chalk.white('  🔊 volume <0-100>  - Set volume percentage (0-100)'))
    console.log(chalk.white('  🔇 mute            - Mute audio'))
    console.log(chalk.white('  🔊 unmute          - Unmute audio'))
    console.log(chalk.white('  🚪 quit            - Exit test client\n'))
  }

  setupManualInput() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const promptUser = () => {
      rl.question('> ', async (input) => {
        const command = input.trim().toLowerCase()

        if (command === 'quit') {
          console.log(chalk.yellow('👋 [Test] Goodbye!'))
          rl.close()
          this.disconnect()
          process.exit(0)
        } else if (command === 'camera_on') {
          await this.callTool('control_camera', { enabled: true })
        } else if (command === 'camera_off') {
          await this.callTool('control_camera', { enabled: false })
        } else if (command.startsWith('emotion ')) {
          const emotion = command.split(' ')[1]
          await this.callTool('change_emotion', { emotion })
        } else if (command.startsWith('volume ')) {
          const volume = parseInt(command.split(' ')[1])
          if (isNaN(volume) || volume < 0 || volume > 100) {
            console.log(chalk.red('❓ Volume must be a number between 0 and 100'))
          } else {
            await this.callTool('control_volume', { volume })
          }
        } else if (command === 'mute') {
          await this.callTool('control_volume', { muted: true })
        } else if (command === 'unmute') {
          await this.callTool('control_volume', { muted: false })
        } else {
          console.log(
            chalk.red(
              '❓ Unknown command. Try: camera_on, camera_off, emotion <emotion>, volume <0-100>, mute, unmute, quit',
            ),
          )
        }

        promptUser()
      })
    }

    promptUser()
  }

  async callTool(toolName, args) {
    if (!this.currentServer) {
      console.log(chalk.red('❌ [MCP Client] No server available'))
      return
    }

    try {
      console.log(
        chalk.magenta(`🛠️  [MCP Client] Calling tool: ${chalk.bold(toolName)}`),
        chalk.gray('with args:'),
        args,
      )

      const result = await this.client.callTool(this.currentServer.serverId, toolName, args)

      if (result.isError) {
        console.log(chalk.red('❌ [MCP Client] Tool call error:'), result.content[0]?.text || 'Unknown error')
      } else {
        console.log(chalk.green('✅ [MCP Client] Tool call result:'), result.content[0]?.text || 'Success')
      }
    } catch (error) {
      console.error(chalk.red('❌ [MCP Client] Tool call failed:'), error.message)
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect()
      this.isConnected = false
      console.log(chalk.gray('🔌 [MCP Client] Disconnected'))
    }
  }
}

// Test runner
async function runTest() {
  console.log(chalk.bold.blue('\n🚀 === MCP Client Test Started ===\n'))

  const client = new McpTestClient({
    brokerUrl: 'ws://localhost:8083/mqtt',
  })

  try {
    await client.connect()

    console.log(chalk.green('\n✅ [Test] MCP Client connected, waiting for server discovery...'))
    console.log(chalk.yellow('💡 [Test] Make sure the Web UI is running to see the interaction!\n'))

    // Keep the client running to receive messages
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n👋 [Test] Shutting down...'))
      client.disconnect()
      process.exit(0)
    })
  } catch (error) {
    console.error(chalk.red('❌ [Test] Failed to start test client:'), error)
    process.exit(1)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTest()
}

export { McpTestClient }
