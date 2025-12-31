/**
 * OpenCode Memory System Plugin
 * 
 * Auto-updates memory state in real-time based on session events
 * Hooks into session lifecycle to maintain persistent memory
 */

import type { Plugin } from "@opencode-ai/plugin"
import { existsSync } from "fs"
import { join } from "path"

export const MemoryPlugin: Plugin = async (ctx) => {
  const memoryDir = join(ctx.directory, "memory")
  const statePath = join(memoryDir, "state.json")
  const sessionsPath = join(memoryDir, "sessions.jsonl")
  const metricsPath = join(memoryDir, "metrics.json")
  
  // Only activate if memory system is present
  if (!existsSync(memoryDir)) {
    console.log("Memory system not found, plugin inactive")
    return {}
  }
  
  let currentSessionStart: Date | null = null
  let tokenCount = 0
  let toolCallCount = 0
  
  return {
    event: async ({ event }) => {
      try {
        // Track session lifecycle
        if (event.type === "session.created") {
          currentSessionStart = new Date()
          console.log(`[Memory] Session started: ${event.properties.info.id}`)
          
          // Log session to sessions.jsonl
          await ctx.$`echo ${JSON.stringify({
            type: "session_start",
            timestamp: currentSessionStart.toISOString(),
            session_id: event.properties.info.id
          })} >> ${sessionsPath}`
        }
        
        if (event.type === "session.idle") {
          console.log(`[Memory] Session idle: ${event.properties.sessionID}`)
          
          // Update state.json with current metrics
          if (currentSessionStart) {
            const sessionDuration = Date.now() - currentSessionStart.getTime()
            
            await ctx.$`echo ${JSON.stringify({
              type: "session_end",
              timestamp: new Date().toISOString(),
              session_id: event.properties.sessionID,
              duration_ms: sessionDuration,
              tool_calls: toolCallCount
            })} >> ${sessionsPath}`
            
            // Update metrics
            const metricsData = existsSync(metricsPath) 
              ? JSON.parse(await ctx.$`cat ${metricsPath}`.text())
              : { total_sessions: 0, total_tool_calls: 0, total_tokens: 0 }
            
            metricsData.total_sessions = (metricsData.total_sessions || 0) + 1
            metricsData.total_tool_calls = (metricsData.total_tool_calls || 0) + toolCallCount
            metricsData.last_session = new Date().toISOString()
            
            await ctx.$`echo ${JSON.stringify(metricsData, null, 2)} > ${metricsPath}`
          }
        }
        
        if (event.type === "session.error") {
          console.error(`[Memory] Session error:`, event.properties.error)
          
          await ctx.$`echo ${JSON.stringify({
            type: "session_error",
            timestamp: new Date().toISOString(),
            error: event.properties.error
          })} >> ${sessionsPath}`
        }
        
        // Track file edits for knowledge extraction
        if (event.type === "file.edited") {
          console.log(`[Memory] File edited: ${event.properties.file}`)
          
          // Could trigger knowledge extraction here in the future
          await ctx.$`echo ${JSON.stringify({
            type: "file_edit",
            timestamp: new Date().toISOString(),
            file: event.properties.file
          })} >> ${sessionsPath}`
        }
        
        // Track context compaction
        if (event.type === "session.compacted") {
          console.log(`[Memory] Session compacted: ${event.properties.sessionID}`)
          
          await ctx.$`echo ${JSON.stringify({
            type: "compaction",
            timestamp: new Date().toISOString(),
            session_id: event.properties.sessionID
          })} >> ${sessionsPath}`
        }
        
      } catch (error) {
        // Fail silently to not disrupt session
        console.error("[Memory] Plugin error:", error)
      }
    },
    
    "tool.execute.after": async (input, output) => {
      try {
        // Count tool calls for metrics
        toolCallCount++
        
        // Track memory-related tool usage
        if (input.tool === "read" && input.args?.filePath?.includes("memory/")) {
          console.log(`[Memory] Memory file read: ${input.args.filePath}`)
        }
        
        if (input.tool === "write" && input.args?.filePath?.includes("memory/")) {
          console.log(`[Memory] Memory file updated: ${input.args.filePath}`)
        }
        
        if (input.tool === "edit" && input.args?.filePath?.includes("memory/")) {
          console.log(`[Memory] Memory file edited: ${input.args.filePath}`)
        }
        
      } catch (error) {
        console.error("[Memory] Tool tracking error:", error)
      }
    },
    
    // Update state on session updates
    config: async (config) => {
      console.log("[Memory] Plugin loaded - monitoring session events")
    }
  }
}

export default MemoryPlugin
