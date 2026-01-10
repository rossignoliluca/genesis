#!/bin/bash
#
# Genesis 6.8 - Mac Setup Script
#
# Installs all dependencies for local-first operation:
# - Homebrew (if needed)
# - Ollama (local LLM)
# - qwen2.5-coder model (optimized for coding)
# - Node.js dependencies
# - Global binary link
#
# Usage: ./bin/setup-mac.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Header
echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                                       ║${NC}"
echo -e "${CYAN}║     ██████╗ ███████╗███╗   ██╗███████╗███████╗██╗███████╗            ║${NC}"
echo -e "${CYAN}║    ██╔════╝ ██╔════╝████╗  ██║██╔════╝██╔════╝██║██╔════╝            ║${NC}"
echo -e "${CYAN}║    ██║  ███╗█████╗  ██╔██╗ ██║█████╗  ███████╗██║███████╗            ║${NC}"
echo -e "${CYAN}║    ██║   ██║██╔══╝  ██║╚██╗██║██╔══╝  ╚════██║██║╚════██║            ║${NC}"
echo -e "${CYAN}║    ╚██████╔╝███████╗██║ ╚████║███████╗███████║██║███████║            ║${NC}"
echo -e "${CYAN}║     ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝╚═╝╚══════╝            ║${NC}"
echo -e "${CYAN}║                                                                       ║${NC}"
echo -e "${CYAN}║              Mac Setup Script - Local-First Edition                   ║${NC}"
echo -e "${CYAN}║                                                                       ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check macOS
if [[ "$(uname)" != "Darwin" ]]; then
    log_error "This script is for macOS only."
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

log_info "Project directory: $PROJECT_DIR"

# =============================================================================
# Step 1: Check/Install Homebrew
# =============================================================================
echo ""
log_info "Step 1: Checking Homebrew..."

if command -v brew &> /dev/null; then
    log_success "Homebrew is installed"
else
    log_warn "Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add to PATH for Apple Silicon
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi

    log_success "Homebrew installed"
fi

# =============================================================================
# Step 2: Install System Dependencies
# =============================================================================
echo ""
log_info "Step 2: Checking system dependencies..."

# SQLite (usually pre-installed on macOS)
if command -v sqlite3 &> /dev/null; then
    log_success "SQLite is available: $(sqlite3 --version | head -1)"
else
    log_warn "Installing SQLite..."
    brew install sqlite
    log_success "SQLite installed"
fi

# =============================================================================
# Step 3: Install Ollama
# =============================================================================
echo ""
log_info "Step 3: Checking Ollama..."

if command -v ollama &> /dev/null; then
    log_success "Ollama is installed: $(ollama --version)"
else
    log_warn "Ollama not found. Installing..."
    brew install ollama
    log_success "Ollama installed"
fi

# Start Ollama service
if pgrep -x "ollama" > /dev/null; then
    log_success "Ollama service is running"
else
    log_info "Starting Ollama service..."
    ollama serve &> /dev/null &
    sleep 2
    log_success "Ollama service started"
fi

# =============================================================================
# Step 4: Download Coding Model
# =============================================================================
echo ""
log_info "Step 4: Checking coding model..."

# Check if qwen2.5-coder is available
if ollama list 2>/dev/null | grep -q "qwen2.5-coder"; then
    log_success "qwen2.5-coder model is available"
else
    log_warn "Downloading qwen2.5-coder model (this may take a few minutes)..."
    ollama pull qwen2.5-coder
    log_success "qwen2.5-coder model downloaded"
fi

# Optional: Download backup model
echo ""
read -p "Download backup model (deepseek-coder, smaller)? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if ollama list 2>/dev/null | grep -q "deepseek-coder"; then
        log_success "deepseek-coder already available"
    else
        log_info "Downloading deepseek-coder..."
        ollama pull deepseek-coder
        log_success "deepseek-coder downloaded"
    fi
fi

# =============================================================================
# Step 5: Install Node.js Dependencies
# =============================================================================
echo ""
log_info "Step 5: Installing Node.js dependencies..."

cd "$PROJECT_DIR"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_success "Node.js is installed: $NODE_VERSION"

    # Check version >= 18
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1 | sed 's/v//')
    if [[ $NODE_MAJOR -lt 18 ]]; then
        log_warn "Node.js 18+ recommended. Current: $NODE_VERSION"
    fi
else
    log_error "Node.js not found. Install with: brew install node"
    exit 1
fi

# Install npm dependencies
log_info "Running npm install..."
npm install

log_success "Dependencies installed"

# =============================================================================
# Step 6: Build Project
# =============================================================================
echo ""
log_info "Step 6: Building project..."

npm run build

log_success "Build complete"

# =============================================================================
# Step 7: Create Global Binary
# =============================================================================
echo ""
log_info "Step 7: Creating global binary link..."

# Create genesis wrapper script
cat > "$SCRIPT_DIR/genesis" << 'GENESIS_SCRIPT'
#!/bin/bash
#
# Genesis CLI Launcher
#

# Get the real script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Set environment
export GENESIS_HOME="$PROJECT_DIR"
export GENESIS_DATA="$HOME/.genesis"

# Create data directory if needed
mkdir -p "$GENESIS_DATA"

# Run genesis
exec node "$PROJECT_DIR/dist/src/index.js" "$@"
GENESIS_SCRIPT

chmod +x "$SCRIPT_DIR/genesis"

# Link globally
npm link 2>/dev/null || log_warn "npm link failed (may need sudo)"

# Also add to /usr/local/bin if possible
if [[ -w /usr/local/bin ]]; then
    ln -sf "$SCRIPT_DIR/genesis" /usr/local/bin/genesis 2>/dev/null
    log_success "Genesis linked to /usr/local/bin/genesis"
else
    log_warn "Cannot link to /usr/local/bin (permission denied)"
    log_info "Add to PATH manually: export PATH=\"$SCRIPT_DIR:\$PATH\""
fi

log_success "Global binary created"

# =============================================================================
# Step 8: Create Data Directories
# =============================================================================
echo ""
log_info "Step 8: Creating data directories..."

mkdir -p "$HOME/.genesis"
mkdir -p "$HOME/.genesis/cache"
mkdir -p "$HOME/.genesis/index"
mkdir -p "$HOME/.genesis/logs"

log_success "Data directories created at ~/.genesis"

# =============================================================================
# Step 9: Verify Installation
# =============================================================================
echo ""
log_info "Step 9: Verifying installation..."

# Test Ollama
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    log_success "Ollama API is responding"
else
    log_warn "Ollama API not responding. Run: ollama serve"
fi

# Test Genesis
if [[ -f "$PROJECT_DIR/dist/src/index.js" ]]; then
    log_success "Genesis build exists"
else
    log_error "Genesis build not found. Run: npm run build"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                      Setup Complete!                                   ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Installed:${NC}"
echo "    ✅ Homebrew"
echo "    ✅ SQLite"
echo "    ✅ Ollama"
echo "    ✅ qwen2.5-coder model"
echo "    ✅ Node.js dependencies"
echo "    ✅ Genesis binary"
echo ""
echo -e "  ${CYAN}Usage:${NC}"
echo "    genesis help           # Show all commands"
echo "    genesis chat           # Interactive chat"
echo "    genesis infer mcp      # Autonomous inference"
echo "    genesis status         # MCP server status"
echo ""
echo -e "  ${CYAN}Local-First Features:${NC}"
echo "    • Hybrid Router: Local for simple tasks, cloud for complex"
echo "    • Fix Cache: Instant reuse of successful fixes"
echo "    • Project Indexer: Local code search (no LLM needed)"
echo "    • Resilient MCP: Automatic fallback when offline"
echo ""
echo -e "  ${CYAN}Data Location:${NC}"
echo "    ~/.genesis/            # Cache, index, logs"
echo ""
echo -e "  ${YELLOW}Tip:${NC} Run 'genesis chat' to start an interactive session!"
echo ""
