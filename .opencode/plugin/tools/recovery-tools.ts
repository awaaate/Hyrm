/**
 * Session Recovery Tools
 * 
 * Provides tools for saving and recovering agent work in progress:
 * - checkpoint_save: Save current work state
 * - checkpoint_load: Load previous checkpoint for recovery
 * - recovery_status: Check for recoverable sessions
 * - recovery_cleanup: Clean up old checkpoints
 */

import { tool } from "@opencode-ai/plugin";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";

export interface CheckpointData {
  version: string;
  checkpoint_id: string;
  created_at: string;
  agent_id: string;
  session_id: string;
  
  // Current task information
  current_task: {
    task_id: string;
    title: string;
    started_at: string;
    progress_description?: string;
    progress_percentage?: number;
  } | null;
  
  // Files being worked on
  files_modified: Array<{
    path: string;
    action: "created" | "modified" | "deleted";
    backup_path?: string;
  }>;
  
  // Context and notes
  context: {
    what_was_happening: string;
    next_steps: string[];
    blockers?: string[];
  };
  
  // Recovery metadata
  recovery: {
    can_resume: boolean;
    resume_instructions?: string;
    estimated_remaining_work?: string;
  };
}

export interface RecoveryToolsContext {
  memoryDir: string;
  currentSessionId: string | null;
  agentId?: string;
  log: (level: "INFO" | "WARN" | "ERROR", message: string, data?: any) => void;
}

export function createRecoveryTools(getContext: () => RecoveryToolsContext) {
  const getSessionsDir = () => join(getContext().memoryDir, "sessions");
  const getCheckpointPath = (sessionId: string) => 
    join(getSessionsDir(), sessionId, "checkpoint.json");
  
  // Ensure sessions directory exists
  const ensureSessionsDir = () => {
    const dir = getSessionsDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  };
  
  // Get session directory (create if needed)
  const getSessionDir = (sessionId: string) => {
    const dir = join(getSessionsDir(), sessionId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  };

  return {
    checkpoint_save: tool({
      description:
        "Save a checkpoint of current work state. Use this before risky operations or periodically during long tasks to enable recovery if something goes wrong.",
      args: {
        task_id: tool.schema
          .string()
          .describe("ID of the current task being worked on")
          .optional(),
        task_title: tool.schema
          .string()
          .describe("Title of the current task")
          .optional(),
        progress_description: tool.schema
          .string()
          .describe("Description of current progress"),
        progress_percentage: tool.schema
          .number()
          .describe("Estimated completion percentage (0-100)")
          .optional(),
        files_modified: tool.schema
          .array(tool.schema.object({
            path: tool.schema.string(),
            action: tool.schema.enum(["created", "modified", "deleted"]),
          }))
          .describe("List of files that have been modified")
          .optional(),
        next_steps: tool.schema
          .array(tool.schema.string())
          .describe("What should happen next to complete the task"),
        blockers: tool.schema
          .array(tool.schema.string())
          .describe("Any blockers or issues encountered")
          .optional(),
        can_resume: tool.schema
          .boolean()
          .describe("Whether work can be resumed from this checkpoint (default: true)")
          .optional(),
        resume_instructions: tool.schema
          .string()
          .describe("Instructions for resuming work from this checkpoint")
          .optional(),
      },
      async execute({
        task_id,
        task_title,
        progress_description,
        progress_percentage,
        files_modified = [],
        next_steps,
        blockers,
        can_resume = true,
        resume_instructions,
      }) {
        try {
          const ctx = getContext();
          ensureSessionsDir();
          
          const sessionId = ctx.currentSessionId || `session-${Date.now()}`;
          const sessionDir = getSessionDir(sessionId);
          const checkpointPath = join(sessionDir, "checkpoint.json");
          
          const checkpoint: CheckpointData = {
            version: "1.0",
            checkpoint_id: `ckpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            created_at: new Date().toISOString(),
            agent_id: ctx.agentId || "unknown",
            session_id: sessionId,
            
            current_task: task_id ? {
              task_id,
              title: task_title || "Unknown task",
              started_at: new Date().toISOString(),
              progress_description,
              progress_percentage,
            } : null,
            
            files_modified: files_modified.map(f => ({
              path: f.path,
              action: f.action as "created" | "modified" | "deleted",
            })),
            
            context: {
              what_was_happening: progress_description,
              next_steps,
              blockers,
            },
            
            recovery: {
              can_resume,
              resume_instructions,
              estimated_remaining_work: progress_percentage 
                ? `${100 - progress_percentage}% remaining` 
                : undefined,
            },
          };
          
          writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
          
          ctx.log("INFO", "Checkpoint saved", {
            checkpoint_id: checkpoint.checkpoint_id,
            session_id: sessionId,
            task_id,
          });
          
          return JSON.stringify({
            success: true,
            checkpoint: {
              id: checkpoint.checkpoint_id,
              session_id: sessionId,
              path: checkpointPath,
            },
            message: "Checkpoint saved. Work can be recovered from this point.",
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    checkpoint_load: tool({
      description:
        "Load a checkpoint from a previous session to recover work in progress.",
      args: {
        session_id: tool.schema
          .string()
          .describe("Session ID to load checkpoint from. Use recovery_status to find available checkpoints.")
          .optional(),
      },
      async execute({ session_id }) {
        try {
          const ctx = getContext();
          ensureSessionsDir();
          
          // If no session_id provided, find the most recent checkpoint
          let targetSessionId = session_id;
          if (!targetSessionId) {
            const sessionsDir = getSessionsDir();
            const sessions = readdirSync(sessionsDir)
              .filter(f => {
                const path = join(sessionsDir, f);
                return statSync(path).isDirectory() && 
                       existsSync(join(path, "checkpoint.json"));
              })
              .map(f => {
                const checkpoint = JSON.parse(
                  readFileSync(join(sessionsDir, f, "checkpoint.json"), "utf-8")
                );
                return {
                  session_id: f,
                  created_at: checkpoint.created_at,
                  checkpoint,
                };
              })
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            
            if (sessions.length === 0) {
              return JSON.stringify({
                success: false,
                message: "No checkpoints found. Nothing to recover.",
              });
            }
            
            targetSessionId = sessions[0].session_id;
          }
          
          const checkpointPath = getCheckpointPath(targetSessionId);
          
          if (!existsSync(checkpointPath)) {
            return JSON.stringify({
              success: false,
              message: `No checkpoint found for session ${targetSessionId}`,
            });
          }
          
          const checkpoint: CheckpointData = JSON.parse(
            readFileSync(checkpointPath, "utf-8")
          );
          
          ctx.log("INFO", "Checkpoint loaded", {
            checkpoint_id: checkpoint.checkpoint_id,
            session_id: targetSessionId,
          });
          
          return JSON.stringify({
            success: true,
            checkpoint: {
              id: checkpoint.checkpoint_id,
              session_id: checkpoint.session_id,
              created_at: checkpoint.created_at,
              agent_id: checkpoint.agent_id,
              
              current_task: checkpoint.current_task,
              files_modified: checkpoint.files_modified,
              
              context: {
                what_was_happening: checkpoint.context.what_was_happening,
                next_steps: checkpoint.context.next_steps,
                blockers: checkpoint.context.blockers,
              },
              
              recovery: checkpoint.recovery,
            },
            message: checkpoint.recovery.can_resume 
              ? "Checkpoint loaded. You can resume from where the previous agent left off."
              : "Checkpoint loaded but marked as non-resumable. Review context carefully.",
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    recovery_status: tool({
      description:
        "Check for recoverable sessions and their checkpoints. Use this at session start to see if there's work to resume.",
      args: {},
      async execute() {
        try {
          const ctx = getContext();
          ensureSessionsDir();
          
          const sessionsDir = getSessionsDir();
          const sessions = readdirSync(sessionsDir)
            .filter(f => {
              const path = join(sessionsDir, f);
              return statSync(path).isDirectory();
            })
            .map(f => {
              const sessionDir = join(sessionsDir, f);
              const checkpointPath = join(sessionDir, "checkpoint.json");
              const handoffPath = join(sessionDir, "handoff-state.json");
              
              let checkpoint = null;
              let handoff = null;
              
              if (existsSync(checkpointPath)) {
                try {
                  checkpoint = JSON.parse(readFileSync(checkpointPath, "utf-8"));
                } catch {}
              }
              
              if (existsSync(handoffPath)) {
                try {
                  handoff = JSON.parse(readFileSync(handoffPath, "utf-8"));
                } catch {}
              }
              
              return {
                session_id: f,
                has_checkpoint: !!checkpoint,
                has_handoff: !!handoff,
                checkpoint: checkpoint ? {
                  id: checkpoint.checkpoint_id,
                  created_at: checkpoint.created_at,
                  can_resume: checkpoint.recovery?.can_resume,
                  task: checkpoint.current_task?.title,
                  progress: checkpoint.current_task?.progress_percentage,
                } : null,
                handoff: handoff ? {
                  enabled: handoff.handoff_enabled,
                  updated_at: handoff.updated_at,
                } : null,
              };
            })
            .filter(s => s.has_checkpoint || s.has_handoff)
            .sort((a, b) => {
              const aTime = a.checkpoint?.created_at || a.handoff?.updated_at || "";
              const bTime = b.checkpoint?.created_at || b.handoff?.updated_at || "";
              return new Date(bTime).getTime() - new Date(aTime).getTime();
            });
          
          // Find recoverable sessions (with checkpoints that can be resumed)
          const recoverable = sessions.filter(
            s => s.checkpoint?.can_resume === true
          );
          
          ctx.log("INFO", "Recovery status checked", {
            total_sessions: sessions.length,
            recoverable_count: recoverable.length,
          });
          
          return JSON.stringify({
            success: true,
            total_sessions: sessions.length,
            recoverable_count: recoverable.length,
            sessions: sessions.slice(0, 10), // Limit to 10 most recent
            recommendation: recoverable.length > 0
              ? `Found ${recoverable.length} recoverable session(s). Use checkpoint_load("${recoverable[0].session_id}") to resume.`
              : "No recoverable sessions. Start fresh or create a new checkpoint.",
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    recovery_cleanup: tool({
      description:
        "Clean up old checkpoints to free up space. By default, keeps checkpoints from the last 24 hours.",
      args: {
        keep_hours: tool.schema
          .number()
          .describe("Keep checkpoints from the last N hours (default: 24)")
          .optional(),
        dry_run: tool.schema
          .boolean()
          .describe("If true, just show what would be deleted without actually deleting")
          .optional(),
      },
      async execute({ keep_hours = 24, dry_run = false }) {
        try {
          const ctx = getContext();
          ensureSessionsDir();
          
          const sessionsDir = getSessionsDir();
          const cutoffTime = Date.now() - (keep_hours * 60 * 60 * 1000);
          
          const sessions = readdirSync(sessionsDir)
            .filter(f => {
              const path = join(sessionsDir, f);
              return statSync(path).isDirectory();
            });
          
          const toCleanup: string[] = [];
          const toKeep: string[] = [];
          
          for (const sessionId of sessions) {
            const checkpointPath = join(sessionsDir, sessionId, "checkpoint.json");
            
            if (existsSync(checkpointPath)) {
              try {
                const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf-8"));
                const checkpointTime = new Date(checkpoint.created_at).getTime();
                
                if (checkpointTime < cutoffTime) {
                  toCleanup.push(sessionId);
                } else {
                  toKeep.push(sessionId);
                }
              } catch {
                // Invalid checkpoint, mark for cleanup
                toCleanup.push(sessionId);
              }
            }
          }
          
          if (!dry_run) {
            const { rmSync } = await import("fs");
            for (const sessionId of toCleanup) {
              const checkpointPath = join(sessionsDir, sessionId, "checkpoint.json");
              try {
                rmSync(checkpointPath);
                ctx.log("INFO", `Cleaned up checkpoint: ${sessionId}`);
              } catch (e) {
                ctx.log("WARN", `Failed to cleanup checkpoint: ${sessionId}`, { error: String(e) });
              }
            }
          }
          
          ctx.log("INFO", "Recovery cleanup completed", {
            cleaned: toCleanup.length,
            kept: toKeep.length,
            dry_run,
          });
          
          return JSON.stringify({
            success: true,
            cleaned_count: dry_run ? 0 : toCleanup.length,
            would_clean: dry_run ? toCleanup.length : 0,
            kept_count: toKeep.length,
            cleaned_sessions: dry_run ? [] : toCleanup,
            would_clean_sessions: dry_run ? toCleanup : [],
            message: dry_run 
              ? `Would clean up ${toCleanup.length} checkpoint(s) older than ${keep_hours} hours.`
              : `Cleaned up ${toCleanup.length} checkpoint(s). ${toKeep.length} kept.`,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),
  };
}
