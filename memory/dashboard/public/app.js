// Session Intelligence Dashboard - Frontend Logic

const API_BASE = '';
const REFRESH_INTERVAL = 5000; // 5 seconds

// DOM Elements
const elements = {
  sessionCount: document.getElementById('session-count'),
  recoveryRate: document.getElementById('recovery-rate'),
  tokenEfficiency: document.getElementById('token-efficiency'),
  status: document.getElementById('status'),
  currentConversation: document.getElementById('current-conversation'),
  lastSession: document.getElementById('last-session'),
  activeTasks: document.getElementById('active-tasks'),
  recentAchievements: document.getElementById('recent-achievements'),
  memoryTotal: document.getElementById('memory-total'),
  memoryBreakdown: document.getElementById('memory-breakdown'),
  sessionHistory: document.getElementById('session-history'),
  conversations: document.getElementById('conversations'),
  knowledge: document.getElementById('knowledge'),
  lastUpdated: document.getElementById('last-updated'),
  healthText: document.getElementById('health-text')
};

// Utility: Format percentage
function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

// Utility: Format date
function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

// Fetch and update stats
async function updateStats() {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);
    const data = await response.json();
    
    if (data.error) {
      console.error('Stats error:', data.error);
      return;
    }
    
    elements.sessionCount.textContent = data.session_count;
    elements.recoveryRate.textContent = formatPercent(data.recovery_rate);
    elements.tokenEfficiency.textContent = formatPercent(data.token_efficiency);
    elements.status.textContent = data.status.replace(/_/g, ' ').toUpperCase();
    elements.currentConversation.textContent = data.current_conversation;
    elements.lastSession.textContent = formatDate(data.last_session);
    
    // Update active tasks
    if (data.active_tasks && data.active_tasks.length > 0) {
      elements.activeTasks.innerHTML = data.active_tasks
        .map(task => `<li>${task}</li>`)
        .join('');
    } else {
      elements.activeTasks.innerHTML = '<li style="color: #94a3b8;">No active tasks</li>';
    }
    
    // Update recent achievements
    if (data.recent_achievements && data.recent_achievements.length > 0) {
      elements.recentAchievements.innerHTML = data.recent_achievements
        .map(achievement => `<li>${achievement}</li>`)
        .join('');
    } else {
      elements.recentAchievements.innerHTML = '<li style="color: #94a3b8;">No recent achievements</li>';
    }
  } catch (error) {
    console.error('Error fetching stats:', error);
  }
}

// Fetch and update session history
async function updateSessions() {
  try {
    const response = await fetch(`${API_BASE}/api/sessions`);
    const data = await response.json();
    
    if (data.sessions && data.sessions.length > 0) {
      elements.sessionHistory.innerHTML = data.sessions
        .map(session => `
          <div class="session-item">
            <strong>Session ${session.id}</strong> - ${session.phase || 'Unknown Phase'}<br>
            <span style="color: #94a3b8;">${session.summary}</span>
          </div>
        `)
        .join('');
    } else {
      elements.sessionHistory.innerHTML = '<div class="loading">No session history available</div>';
    }
  } catch (error) {
    console.error('Error fetching sessions:', error);
  }
}

// Fetch and update memory footprint
async function updateMemory() {
  try {
    const response = await fetch(`${API_BASE}/api/memory`);
    const data = await response.json();
    
    if (data.error) {
      elements.memoryBreakdown.innerHTML = `<div class="loading">${data.error}</div>`;
      return;
    }
    
    elements.memoryTotal.textContent = data.total_tokens.toLocaleString();
    
    if (data.breakdown && data.breakdown.length > 0) {
      const maxTokens = Math.max(...data.breakdown.map(item => item.tokens));
      
      elements.memoryBreakdown.innerHTML = data.breakdown
        .map(item => {
          const percent = (item.tokens / maxTokens) * 100;
          return `
            <div class="memory-item">
              <span style="min-width: 150px;">${item.file}</span>
              <div class="memory-bar">
                <div class="memory-bar-fill" style="width: ${percent}%"></div>
              </div>
              <span style="min-width: 100px; text-align: right;">
                ${item.tokens.toLocaleString()} tokens
              </span>
            </div>
          `;
        })
        .join('');
    } else {
      elements.memoryBreakdown.innerHTML = '<div class="loading">No memory data available</div>';
    }
  } catch (error) {
    console.error('Error fetching memory:', error);
  }
}

// Fetch and update conversations
async function updateConversations() {
  try {
    const response = await fetch(`${API_BASE}/api/conversations`);
    const data = await response.json();
    
    if (data.conversations && data.conversations.length > 0) {
      elements.conversations.innerHTML = data.conversations
        .map(conv => `
          <div class="conversation-item ${conv.id === data.current ? 'active' : ''}">
            <strong>${conv.id}</strong>
            ${conv.id === data.current ? ' (Active)' : ''}<br>
            <span style="color: #94a3b8; font-size: 0.9rem;">
              ${conv.description || 'No description'}
            </span>
          </div>
        `)
        .join('');
    } else {
      elements.conversations.innerHTML = `
        <div class="conversation-item active">
          <strong>${data.current || 'default'}</strong> (Active)
        </div>
      `;
    }
  } catch (error) {
    console.error('Error fetching conversations:', error);
  }
}

// Fetch and update knowledge base
async function updateKnowledge() {
  try {
    const response = await fetch(`${API_BASE}/api/knowledge`);
    const data = await response.json();
    
    if (data.articles && data.articles.length > 0) {
      elements.knowledge.innerHTML = data.articles
        .map(article => `
          <div class="knowledge-item" title="${article.path}">
            ${article.title}
          </div>
        `)
        .join('');
    } else {
      elements.knowledge.innerHTML = '<div class="loading">No knowledge articles found</div>';
    }
  } catch (error) {
    console.error('Error fetching knowledge:', error);
  }
}

// Check health
async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    
    if (data.status === 'healthy') {
      elements.healthText.textContent = 'Connected';
    } else {
      elements.healthText.textContent = 'Degraded';
    }
  } catch (error) {
    elements.healthText.textContent = 'Disconnected';
    console.error('Health check failed:', error);
  }
}

// Update all data
async function updateAll() {
  await Promise.all([
    updateStats(),
    updateSessions(),
    updateMemory(),
    updateConversations(),
    updateKnowledge(),
    checkHealth()
  ]);
  
  elements.lastUpdated.textContent = new Date().toLocaleTimeString();
}

// Initialize dashboard
async function init() {
  console.log('Session Intelligence Dashboard initializing...');
  
  // Initial load
  await updateAll();
  
  // Set up periodic refresh
  setInterval(updateAll, REFRESH_INTERVAL);
  
  console.log('Dashboard ready. Auto-refresh every', REFRESH_INTERVAL / 1000, 'seconds');
}

// Start the dashboard
init();
