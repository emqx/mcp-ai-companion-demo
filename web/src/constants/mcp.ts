/**
 * MCP Server Constants
 *
 * These constants define the core identification values for the MCP server.
 * They are used across MQTT topic construction, server initialization, and tool routing.
 */

/**
 * Base name for the MCP server that exposes hardware control tools
 * This name is used as a prefix in MQTT topics and server identification
 */
export const MCP_SERVER_NAME = 'web-ui-hardware-controller'
