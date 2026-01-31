#!/bin/bash
# Genesis 72h Test Monitor
# Usage: ./monitor.sh [--live] [--stats] [--health]

LOG_FILE="genesis-72h.log"
PID_FILE=".genesis-pid"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get PID
get_pid() {
    pgrep -f "boot-72h.js" 2>/dev/null || echo ""
}

# Status dashboard
show_status() {
    clear
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}           ${GREEN}GENESIS 72h AUTONOMOUS TEST - MONITOR${NC}            ${BLUE}║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    PID=$(get_pid)

    if [ -n "$PID" ]; then
        UPTIME=$(ps -o etime= -p $PID 2>/dev/null | tr -d ' ')
        MEM=$(ps -o rss= -p $PID 2>/dev/null | awk '{printf "%.1f", $1/1024}')
        CPU=$(ps -o %cpu= -p $PID 2>/dev/null | tr -d ' ')

        echo -e "  ${GREEN}●${NC} Process: ${GREEN}RUNNING${NC} (PID: $PID)"
        echo -e "  ⏱  Uptime: $UPTIME"
        echo -e "  💾 Memory: ${MEM} MB"
        echo -e "  🔥 CPU: ${CPU}%"
    else
        echo -e "  ${RED}●${NC} Process: ${RED}NOT RUNNING${NC}"
    fi

    echo ""
    echo -e "${YELLOW}─── Log Stats ───${NC}"

    if [ -f "$LOG_FILE" ]; then
        LINES=$(wc -l < "$LOG_FILE")
        ERRORS=$(grep -c "ERROR\|error\|Error" "$LOG_FILE" 2>/dev/null || echo "0")
        WARNINGS=$(grep -c "WARN\|warn\|Warning" "$LOG_FILE" 2>/dev/null || echo "0")
        TASKS=$(grep -c "Processed task" "$LOG_FILE" 2>/dev/null || echo "0")

        echo "  📄 Log lines: $LINES"
        echo -e "  ✅ Tasks completed: ${GREEN}$TASKS${NC}"
        echo -e "  ⚠️  Warnings: ${YELLOW}$WARNINGS${NC}"
        echo -e "  ❌ Errors: ${RED}$ERRORS${NC}"

        echo ""
        echo -e "${YELLOW}─── Last Activity ───${NC}"
        tail -5 "$LOG_FILE" | while read line; do
            echo "  $line"
        done

        echo ""
        echo -e "${YELLOW}─── Revenue Status ───${NC}"
        REVENUE=$(grep "Revenue:" "$LOG_FILE" | tail -1 | grep -o '\$[0-9.]*' || echo '$0.00')
        SCANS=$(grep "Scans delivered:" "$LOG_FILE" | tail -1 | grep -o '[0-9]*$' || echo '0')
        echo "  💰 Revenue: $REVENUE"
        echo "  📊 Scans: $SCANS"

        echo ""
        echo -e "${YELLOW}─── Health ───${NC}"
        HEALTH=$(grep "Health:" "$LOG_FILE" | tail -1 | grep -o 'HEALTHY\|DEGRADED\|CRITICAL' || echo 'UNKNOWN')
        if [ "$HEALTH" == "HEALTHY" ]; then
            echo -e "  ${GREEN}● $HEALTH${NC}"
        elif [ "$HEALTH" == "DEGRADED" ]; then
            echo -e "  ${YELLOW}● $HEALTH${NC}"
        else
            echo -e "  ${RED}● $HEALTH${NC}"
        fi

        HEALING=$(grep "Self-healing events:" "$LOG_FILE" | tail -1 | grep -o '[0-9]*$' || echo '0')
        CRITICAL=$(grep "Critical errors:" "$LOG_FILE" | tail -1 | grep -o '[0-9]*$' || echo '0')
        MAINT_CYCLES=$(grep -c "Maintenance cycle completed" "$LOG_FILE" || echo '0')
        DREAM_CYCLES=$(grep -c "Dream completed" "$LOG_FILE" || echo '0')
        echo "  🔧 Self-healing events: $HEALING"
        echo "  💀 Critical errors: $CRITICAL"
        echo "  🔄 Maintenance cycles: $MAINT_CYCLES"
        echo "  💤 Dream cycles: $DREAM_CYCLES"

        echo ""
        echo -e "${YELLOW}─── CompIntel Schedule ───${NC}"
        START_TIME=$(grep "GENESIS 72-HOUR" "$LOG_FILE" | head -1 | grep -o '\[2026[^]]*\]' | tr -d '[]')
        if [ -n "$START_TIME" ]; then
            START_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${START_TIME%.*}" "+%s" 2>/dev/null || echo "0")
            NOW_EPOCH=$(date "+%s")
            ELAPSED=$((NOW_EPOCH - START_EPOCH))
            SCAN_INTERVAL=$((4 * 60 * 60))
            NEXT_SCAN=$((SCAN_INTERVAL - (ELAPSED % SCAN_INTERVAL)))
            NEXT_HOURS=$((NEXT_SCAN / 3600))
            NEXT_MINS=$(((NEXT_SCAN % 3600) / 60))
            echo "  📡 Competitors: Cursor, Windsurf, Aider, Continue"
            echo "  ⏰ Scan interval: 4 hours"
            echo "  ⏳ Next scan in: ${NEXT_HOURS}h ${NEXT_MINS}m"
        else
            echo "  ⏳ Schedule not available"
        fi
    else
        echo "  Log file not found: $LOG_FILE"
    fi

    echo ""
    echo -e "${BLUE}────────────────────────────────────────────────────────────────${NC}"
    echo "  Commands: ./monitor.sh --live | --tail | --errors | --stripe"
}

# Live tail
live_tail() {
    echo -e "${GREEN}Live monitoring (Ctrl+C to stop)${NC}"
    echo ""
    tail -f "$LOG_FILE"
}

# Show errors only
show_errors() {
    echo -e "${RED}=== Errors ===${NC}"
    grep -i "error" "$LOG_FILE" | tail -20
    echo ""
    echo -e "${YELLOW}=== Warnings ===${NC}"
    grep -i "warn" "$LOG_FILE" | tail -20
}

# Show Stripe activity
show_stripe() {
    echo -e "${GREEN}=== Stripe Activity ===${NC}"
    grep -i "stripe\|revenue\|payment\|price" "$LOG_FILE" | tail -30
}

# Main
case "$1" in
    --live|-l)
        live_tail
        ;;
    --tail|-t)
        tail -50 "$LOG_FILE"
        ;;
    --errors|-e)
        show_errors
        ;;
    --stripe|-s)
        show_stripe
        ;;
    --watch|-w)
        while true; do
            show_status
            sleep 10
        done
        ;;
    *)
        show_status
        ;;
esac
