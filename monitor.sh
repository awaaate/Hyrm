#!/bin/bash

# OpenCode Multi-Agent System Monitor
# Real-time monitoring of agents, memory, messages, and system health

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Configuration
MEMORY_DIR="./memory"
REFRESH_INTERVAL=${1:-2}  # Default 2 seconds, can be overridden

# Helper functions
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${WHITE}OpenCode Multi-Agent System Monitor${NC} | $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

check_file() {
    if [ -f "$1" ]; then
        echo "$1"
    else
        echo ""
    fi
}

format_timestamp() {
    # Convert ISO timestamp to relative time
    if command -v node >/dev/null 2>&1; then
        node -e "
            const ts = new Date('$1');
            const now = new Date();
            const diff = (now - ts) / 1000;
            if (diff < 60) console.log(Math.floor(diff) + 's ago');
            else if (diff < 3600) console.log(Math.floor(diff/60) + 'm ago');
            else if (diff < 86400) console.log(Math.floor(diff/3600) + 'h ago');
            else console.log(Math.floor(diff/86400) + 'd ago');
        " 2>/dev/null || echo "$1"
    else
        echo "$1"
    fi
}

show_agents() {
    echo -e "\n${CYAN}🤖 ACTIVE AGENTS${NC}"
    echo -e "${CYAN}────────────────${NC}"
    
    local registry=$(check_file "$MEMORY_DIR/agent-registry.json")
    if [ -z "$registry" ]; then
        echo -e "${RED}No agent registry found${NC}"
        return
    fi
    
    # Parse agent registry
    if command -v jq >/dev/null 2>&1; then
        local agent_count=$(jq -r '.agents | length' "$registry" 2>/dev/null || echo "0")
        echo -e "Total Agents: ${WHITE}$agent_count${NC}"
        
        if [ "$agent_count" -gt 0 ]; then
            echo ""
            jq -r '.agents[] | "ID: \(.agent_id)\nSession: \(.session_id)\nRole: \(.assigned_role // "general")\nStatus: \(.status)\nTask: \(.current_task // "None")\nHeartbeat: \(.last_heartbeat)\n---"' "$registry" | while IFS= read -r line; do
                if [[ $line == "Status: working" ]]; then
                    echo -e "${GREEN}$line${NC}"
                elif [[ $line == "Status: blocked" ]]; then
                    echo -e "${RED}$line${NC}"
                elif [[ $line == "Status: idle" ]]; then
                    echo -e "${YELLOW}$line${NC}"
                elif [[ $line == "Heartbeat:"* ]]; then
                    timestamp=$(echo "$line" | cut -d' ' -f2-)
                    relative=$(format_timestamp "$timestamp")
                    echo -e "Heartbeat: ${PURPLE}$relative${NC}"
                elif [[ $line == "Task:"* ]]; then
                    echo -e "${WHITE}$line${NC}"
                else
                    echo "$line"
                fi
            done
        fi
    else
        echo -e "${YELLOW}Install 'jq' for detailed agent info${NC}"
        cat "$registry" | head -10
    fi
}

show_messages() {
    echo -e "\n${CYAN}💬 RECENT MESSAGES${NC}"
    echo -e "${CYAN}─────────────────${NC}"
    
    local msgbus=$(check_file "$MEMORY_DIR/message-bus.jsonl")
    if [ -z "$msgbus" ]; then
        echo -e "${RED}No message bus found${NC}"
        return
    fi
    
    # Show last 5 messages
    if command -v jq >/dev/null 2>&1; then
        tail -5 "$msgbus" 2>/dev/null | while IFS= read -r line; do
            if [ ! -z "$line" ]; then
                local msg_type=$(echo "$line" | jq -r '.type' 2>/dev/null)
                local from=$(echo "$line" | jq -r '.from_agent' 2>/dev/null | cut -d'-' -f3)
                local timestamp=$(echo "$line" | jq -r '.timestamp' 2>/dev/null)
                local relative=$(format_timestamp "$timestamp")
                
                # Color code by message type
                case "$msg_type" in
                    "broadcast") echo -e "${YELLOW}📢 BROADCAST${NC} from $from ($relative)" ;;
                    "direct") echo -e "${GREEN}✉️  DIRECT${NC} from $from ($relative)" ;;
                    "task_claim") echo -e "${PURPLE}🎯 CLAIM${NC} from $from ($relative)" ;;
                    "task_complete") echo -e "${GREEN}✅ COMPLETE${NC} from $from ($relative)" ;;
                    "request_help") echo -e "${RED}🆘 HELP${NC} from $from ($relative)" ;;
                    *) echo -e "${WHITE}📨 $msg_type${NC} from $from ($relative)" ;;
                esac
                
                # Show payload preview
                local payload=$(echo "$line" | jq -c '.payload' 2>/dev/null)
                if [ "$payload" != "null" ] && [ ! -z "$payload" ]; then
                    echo "   $payload" | head -c 80
                    echo ""
                fi
            fi
        done
    else
        echo "Last 5 messages:"
        tail -5 "$msgbus" 2>/dev/null
    fi
}

show_memory_state() {
    echo -e "\n${CYAN}🧠 MEMORY STATE${NC}"
    echo -e "${CYAN}───────────────${NC}"
    
    local state=$(check_file "$MEMORY_DIR/state.json")
    if [ -z "$state" ]; then
        echo -e "${RED}No state file found${NC}"
        return
    fi
    
    if command -v jq >/dev/null 2>&1; then
        local session_count=$(jq -r '.session_count // 0' "$state")
        local status=$(jq -r '.status // "unknown"' "$state")
        local active_tasks=$(jq -r '.active_tasks | length' "$state" 2>/dev/null || echo "0")
        local achievements=$(jq -r '.recent_achievements | length' "$state" 2>/dev/null || echo "0")
        
        echo -e "Sessions: ${WHITE}$session_count${NC}"
        echo -e "Status: ${GREEN}$status${NC}"
        echo -e "Active Tasks: ${WHITE}$active_tasks${NC}"
        echo -e "Achievements: ${WHITE}$achievements${NC}"
        
        # Show active tasks if any
        if [ "$active_tasks" -gt 0 ]; then
            echo -e "\nActive Tasks:"
            jq -r '.active_tasks[]? // empty' "$state" 2>/dev/null | while IFS= read -r task; do
                if [ ! -z "$task" ] && [ "$task" != "null" ]; then
                    echo -e "  • ${WHITE}$task${NC}"
                fi
            done
        fi
    else
        head -10 "$state"
    fi
}

show_system_health() {
    echo -e "\n${CYAN}💚 SYSTEM HEALTH${NC}"
    echo -e "${CYAN}────────────────${NC}"
    
    # Check file sizes
    local registry_size=$(du -h "$MEMORY_DIR/agent-registry.json" 2>/dev/null | cut -f1 || echo "N/A")
    local msgbus_size=$(du -h "$MEMORY_DIR/message-bus.jsonl" 2>/dev/null | cut -f1 || echo "N/A")
    local coord_log_size=$(du -h "$MEMORY_DIR/coordination.log" 2>/dev/null | cut -f1 || echo "N/A")
    
    echo -e "Registry Size: ${WHITE}$registry_size${NC}"
    echo -e "Message Bus: ${WHITE}$msgbus_size${NC}"
    echo -e "Coord Log: ${WHITE}$coord_log_size${NC}"
    
    # Count recent coordination events
    if [ -f "$MEMORY_DIR/coordination.log" ]; then
        local recent_events=$(tail -100 "$MEMORY_DIR/coordination.log" 2>/dev/null | wc -l)
        echo -e "Recent Events (last 100): ${WHITE}$recent_events${NC}"
    fi
    
    # Check for stale locks
    local lock_count=$(find . -name "*.lock" -type f 2>/dev/null | wc -l)
    if [ "$lock_count" -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Active file locks: $lock_count${NC}"
    fi
}

show_recent_logs() {
    echo -e "\n${CYAN}📋 RECENT COORDINATION EVENTS${NC}"
    echo -e "${CYAN}────────────────────────────${NC}"
    
    local coord_log=$(check_file "$MEMORY_DIR/coordination.log")
    if [ -z "$coord_log" ]; then
        echo -e "${RED}No coordination log found${NC}"
        return
    fi
    
    # Show last 5 coordination events
    tail -5 "$coord_log" 2>/dev/null | while IFS= read -r line; do
        if [[ $line == *"ERROR"* ]]; then
            echo -e "${RED}$line${NC}"
        elif [[ $line == *"WARN"* ]]; then
            echo -e "${YELLOW}$line${NC}"
        elif [[ $line == *"registered"* ]] || [[ $line == *"unregistered"* ]]; then
            echo -e "${GREEN}$line${NC}"
        elif [[ $line == *"Message"* ]]; then
            echo -e "${PURPLE}$line${NC}"
        else
            echo "$line"
        fi
    done | cut -c1-120  # Truncate long lines
}

# Main monitoring loop
main() {
    # Check if running in watch mode or single shot
    if [ "$1" == "--once" ] || [ "$1" == "-1" ]; then
        clear
        print_header
        show_agents
        show_messages
        show_memory_state
        show_system_health
        show_recent_logs
        exit 0
    fi
    
    echo -e "${GREEN}Starting Multi-Agent System Monitor...${NC}"
    echo -e "${WHITE}Refresh interval: ${REFRESH_INTERVAL}s (Press Ctrl+C to exit)${NC}"
    echo ""
    
    # Continuous monitoring
    while true; do
        clear
        print_header
        show_agents
        show_messages
        show_memory_state
        show_system_health
        show_recent_logs
        
        echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${WHITE}Refreshing in ${REFRESH_INTERVAL}s... (Ctrl+C to exit)${NC}"
        
        sleep "$REFRESH_INTERVAL"
    done
}

# Handle script arguments
case "$1" in
    --help|-h)
        echo "OpenCode Multi-Agent System Monitor"
        echo ""
        echo "Usage: $0 [refresh_interval] [--once]"
        echo ""
        echo "Options:"
        echo "  refresh_interval   Seconds between updates (default: 2)"
        echo "  --once, -1        Run once and exit"
        echo "  --help, -h        Show this help"
        echo ""
        echo "Examples:"
        echo "  $0              # Monitor with 2s refresh"
        echo "  $0 5            # Monitor with 5s refresh"
        echo "  $0 --once       # Show status once and exit"
        exit 0
        ;;
    --once|-1)
        main "--once"
        ;;
    *)
        main "$@"
        ;;
esac