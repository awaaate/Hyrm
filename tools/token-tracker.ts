#!/usr/bin/env node

/**
 * Token Consumption Tracker with Anomaly Detection
 * 
 * Monitors token usage across sessions and detects:
 * - Token spikes (unusually high consumption)
 * - Inefficiency patterns (high tokens, low progress)
 * - Trend analysis (consumption over time)
 */

import * as fs from 'fs';
import * as path from 'path';

interface SessionMetrics {
  session_id: number;
  timestamp: string;
  tokens_used: number;
  tasks_completed: number;
  status: string;
  efficiency_score: number;
}

interface AnomalyReport {
  type: 'spike' | 'inefficiency' | 'trend' | 'stagnation';
  severity: 'low' | 'medium' | 'high';
  message: string;
  data: any;
}

class TokenTracker {
  private metricsPath = '/app/workspace/memory/metrics.json';
  private statePath = '/app/workspace/memory/state.json';
  private historyPath = '/app/workspace/memory/.token-history.json';
  
  private history: SessionMetrics[] = [];

  constructor() {
    this.loadHistory();
  }

  /**
   * Load historical token data
   */
  private loadHistory(): void {
    if (fs.existsSync(this.historyPath)) {
      this.history = JSON.parse(fs.readFileSync(this.historyPath, 'utf-8'));
    }
  }

  /**
   * Save historical token data
   */
  private saveHistory(): void {
    fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
  }

  /**
   * Record current session metrics
   */
  recordCurrentSession(): void {
    const state = JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
    const metrics = JSON.parse(fs.readFileSync(this.metricsPath, 'utf-8'));

    const currentSession: SessionMetrics = {
      session_id: state.session_count,
      timestamp: state.last_session,
      tokens_used: metrics.efficiency.total_tokens_used,
      tasks_completed: metrics.effectiveness.tasks_completed,
      status: state.status,
      efficiency_score: this.calculateEfficiency(
        metrics.efficiency.avg_tokens_per_session,
        metrics.effectiveness.tasks_completed,
        state.session_count
      )
    };

    // Check if this session already exists (update) or is new
    const existingIndex = this.history.findIndex(
      s => s.session_id === currentSession.session_id
    );

    if (existingIndex >= 0) {
      this.history[existingIndex] = currentSession;
    } else {
      this.history.push(currentSession);
    }

    this.saveHistory();
    console.log('✅ Session metrics recorded');
  }

  /**
   * Calculate efficiency score (0-100)
   */
  private calculateEfficiency(
    avgTokens: number,
    tasksCompleted: number,
    sessionCount: number
  ): number {
    const tasksPerSession = tasksCompleted / sessionCount;
    const tokensPerTask = avgTokens / (tasksPerSession || 1);
    
    // Lower tokens per task = higher efficiency
    // Assume 5000 tokens/task is "baseline" (score = 50)
    const baselineTokensPerTask = 5000;
    const score = Math.max(0, Math.min(100, 
      100 - ((tokensPerTask - baselineTokensPerTask) / baselineTokensPerTask * 50)
    ));
    
    return Math.round(score);
  }

  /**
   * Detect anomalies in token consumption
   */
  detectAnomalies(): AnomalyReport[] {
    const anomalies: AnomalyReport[] = [];

    if (this.history.length < 3) {
      return anomalies; // Need at least 3 sessions for meaningful analysis
    }

    // Get recent sessions (last 5)
    const recentSessions = this.history.slice(-5);
    const currentSession = this.history[this.history.length - 1];
    
    // Calculate average tokens for recent sessions (excluding current)
    const avgRecentTokens = recentSessions.slice(0, -1).reduce((sum, s) => {
      const sessionTokens = s.session_id === 1 
        ? s.tokens_used 
        : s.tokens_used - (this.history[this.history.findIndex(h => h.session_id === s.session_id) - 1]?.tokens_used || 0);
      return sum + sessionTokens;
    }, 0) / (recentSessions.length - 1);

    // Current session tokens
    const currentSessionTokens = currentSession.session_id === 1
      ? currentSession.tokens_used
      : currentSession.tokens_used - (this.history[this.history.length - 2]?.tokens_used || 0);

    // 1. Token Spike Detection
    if (currentSessionTokens > avgRecentTokens * 1.5) {
      anomalies.push({
        type: 'spike',
        severity: currentSessionTokens > avgRecentTokens * 2 ? 'high' : 'medium',
        message: `Token spike detected: ${currentSessionTokens.toLocaleString()} tokens (${Math.round(currentSessionTokens / avgRecentTokens * 100 - 100)}% above average)`,
        data: {
          current: currentSessionTokens,
          average: Math.round(avgRecentTokens),
          threshold: Math.round(avgRecentTokens * 1.5)
        }
      });
    }

    // 2. Inefficiency Detection (high tokens, low tasks)
    const avgTasksPerSession = recentSessions
      .reduce((sum, s, i) => {
        if (i === 0) return s.tasks_completed;
        const prevTasks = recentSessions[i - 1]?.tasks_completed || 0;
        return sum + (s.tasks_completed - prevTasks);
      }, 0) / recentSessions.length;

    const currentTasksDelta = currentSession.tasks_completed - 
      (this.history[this.history.length - 2]?.tasks_completed || 0);

    if (currentSessionTokens > avgRecentTokens && currentTasksDelta < avgTasksPerSession * 0.5) {
      anomalies.push({
        type: 'inefficiency',
        severity: 'high',
        message: `High token usage with low progress: ${currentSessionTokens.toLocaleString()} tokens but only ${currentTasksDelta} tasks completed`,
        data: {
          tokens: currentSessionTokens,
          tasks: currentTasksDelta,
          avgTasks: Math.round(avgTasksPerSession * 10) / 10
        }
      });
    }

    // 3. Stagnation Detection (same status for 3+ sessions)
    const recentStatuses = recentSessions.map(s => s.status);
    const sameStatus = recentStatuses.every(s => s === currentSession.status);
    if (sameStatus && recentSessions.length >= 3) {
      anomalies.push({
        type: 'stagnation',
        severity: 'medium',
        message: `Status unchanged for ${recentSessions.length} sessions: "${currentSession.status}"`,
        data: {
          status: currentSession.status,
          sessions: recentSessions.length
        }
      });
    }

    // 4. Trend Analysis (increasing tokens over time)
    if (this.history.length >= 5) {
      const last5SessionTokens = this.history.slice(-5).map((s, i) => {
        if (i === 0) return s.tokens_used;
        return s.tokens_used - (this.history[this.history.length - 5 + i - 1]?.tokens_used || 0);
      });
      
      const firstHalf = last5SessionTokens.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const secondHalf = last5SessionTokens.slice(-2).reduce((a, b) => a + b, 0) / 2;
      
      if (secondHalf > firstHalf * 1.3) {
        anomalies.push({
          type: 'trend',
          severity: 'low',
          message: `Upward trend in token consumption: ${Math.round((secondHalf / firstHalf - 1) * 100)}% increase over last 5 sessions`,
          data: {
            early_avg: Math.round(firstHalf),
            recent_avg: Math.round(secondHalf),
            increase_percent: Math.round((secondHalf / firstHalf - 1) * 100)
          }
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate comprehensive report
   */
  generateReport(): void {
    console.log('\n📊 Token Consumption Report\n');

    if (this.history.length === 0) {
      console.log('No session data available yet.');
      return;
    }

    // Summary statistics
    const totalTokens = this.history[this.history.length - 1].tokens_used;
    const totalSessions = this.history.length;
    const avgTokensPerSession = totalTokens / totalSessions;
    const totalTasks = this.history[this.history.length - 1].tasks_completed;

    console.log('📈 Summary:');
    console.log(`   Total sessions: ${totalSessions}`);
    console.log(`   Total tokens: ${totalTokens.toLocaleString()}`);
    console.log(`   Avg tokens/session: ${Math.round(avgTokensPerSession).toLocaleString()}`);
    console.log(`   Total tasks completed: ${totalTasks}`);
    console.log(`   Avg tokens/task: ${Math.round(totalTokens / (totalTasks || 1)).toLocaleString()}`);

    // Recent sessions
    console.log('\n📋 Recent Sessions (last 5):');
    const recent = this.history.slice(-5);
    recent.forEach((session, i) => {
      const sessionTokens = i === 0 && this.history.length > 5
        ? session.tokens_used - (this.history[this.history.length - 5 - 1]?.tokens_used || 0)
        : session.tokens_used - (recent[i - 1]?.tokens_used || 0);
      
      const tasksDelta = i === 0 && this.history.length > 5
        ? session.tasks_completed - (this.history[this.history.length - 5 - 1]?.tasks_completed || 0)
        : session.tasks_completed - (recent[i - 1]?.tasks_completed || 0);

      console.log(`   S${session.session_id}: ${sessionTokens.toLocaleString()} tokens, ${tasksDelta} tasks (efficiency: ${session.efficiency_score}/100)`);
    });

    // Anomaly detection
    const anomalies = this.detectAnomalies();
    if (anomalies.length > 0) {
      console.log('\n⚠️  Anomalies Detected:');
      anomalies.forEach(anomaly => {
        const icon = anomaly.severity === 'high' ? '🔴' : anomaly.severity === 'medium' ? '🟡' : '🟢';
        console.log(`   ${icon} [${anomaly.type.toUpperCase()}] ${anomaly.message}`);
      });
    } else {
      console.log('\n✅ No anomalies detected - token usage is within normal parameters');
    }

    // Efficiency trend
    console.log('\n📊 Efficiency Trend (last 5 sessions):');
    const efficiencyTrend = recent.map(s => s.efficiency_score).join(' → ');
    console.log(`   ${efficiencyTrend}`);

    console.log('');
  }

  /**
   * Show quick status
   */
  status(): void {
    this.recordCurrentSession();
    const current = this.history[this.history.length - 1];
    const prev = this.history[this.history.length - 2];

    console.log('\n📊 Current Session Status\n');
    console.log(`Session: ${current.session_id}`);
    console.log(`Status: ${current.status}`);
    console.log(`Total tokens: ${current.tokens_used.toLocaleString()}`);
    
    if (prev) {
      const delta = current.tokens_used - prev.tokens_used;
      console.log(`Tokens this session: ${delta.toLocaleString()}`);
    }
    
    console.log(`Efficiency score: ${current.efficiency_score}/100`);
    console.log('');
  }
}

// CLI Interface
const command = process.argv[2] || 'status';
const tracker = new TokenTracker();

switch (command) {
  case 'record':
    tracker.recordCurrentSession();
    break;
  case 'report':
    tracker.generateReport();
    break;
  case 'status':
  default:
    tracker.status();
    break;
}
