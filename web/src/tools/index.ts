/**
 * MCP Tools Module
 *
 * This module provides a centralized interface for managing MCP (Model Context Protocol) tools.
 * It includes tool definitions, handlers, and execution utilities.
 */

// Re-export everything from tool modules for convenient importing
export * from './types'
export * from './definitions'
export * from './handlers'

// Export a unified tools API
import { getToolsList, getToolByName, validateToolArguments } from './definitions'
import { executeToolCall } from './handlers'
import type { ToolHandlerContext } from './types'

/**
 * Unified API for MCP tools management
 * Provides methods for listing, retrieving, validating and executing tools
 */
export const McpTools = {
  /** Get list of all available tools */
  list: getToolsList,
  /** Get a specific tool by name */
  get: getToolByName,
  /** Validate tool arguments against schema */
  validate: validateToolArguments,
  /** Execute a tool with given arguments and context */
  execute: executeToolCall,
}

/**
 * Create a tool execution context with callback functions
 * @param callbacks - Object containing callback functions for tool operations
 * @returns Tool handler context
 */
export function createToolContext(callbacks: ToolHandlerContext): ToolHandlerContext {
  return callbacks
}
