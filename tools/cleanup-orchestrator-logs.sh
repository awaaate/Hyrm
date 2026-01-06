#!/bin/bash
# Cleanup old orchestrator crash logs and diagnostics
# Purpose: Maintain a rolling window of recent diagnostics while preventing unbounded disk growth
# Usage: bash tools/cleanup-orchestrator-logs.sh [--dry-run]

set -e

# Configuration
CRASH_LOG_DIR="logs/orchestrator-failures"
ARCHIVE_DIR="memory/archives/diagnostics"
COMPRESSED_ARCHIVE_DIR="memory/archives/compressed-archives"
ARCHIVE_AGE_HOURS=24        # Files older than 24 hours get archived
ARCHIVE_AGE_DAYS=1          # -mtime +1 means files modified before 24 hours ago
SIZE_LIMIT_MB=100           # Maximum size of crash log directory
ARCHIVE_COMPRESSION_THRESHOLD_MB=500  # Compress archives when exceeding this size
DRY_RUN=${1:-""}

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
  if [ "$DEBUG" = "1" ]; then
    echo -e "${YELLOW}[DEBUG]${NC} $1"
  fi
}

# Validate directories exist
if [ ! -d "$CRASH_LOG_DIR" ]; then
  log_warn "Crash log directory not found: $CRASH_LOG_DIR - nothing to clean"
  exit 0
fi

mkdir -p "$ARCHIVE_DIR"
mkdir -p "$COMPRESSED_ARCHIVE_DIR"

# Step 1: Archive files older than 24 hours
log_info "Scanning for crash logs older than $ARCHIVE_AGE_HOURS hours..."

ARCHIVED_COUNT=0
ARCHIVED_SIZE=0

# Find files older than 24 hours and archive them
while IFS= read -r file; do
  if [ -z "$file" ]; then
    continue
  fi
  
  file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
  file_size_kb=$((file_size / 1024))
  
  # Create archive filename with current timestamp
  base_name=$(basename "$file")
  archive_file="$ARCHIVE_DIR/${base_name}.archived"
  
  log_debug "Archiving: $file (${file_size_kb}KB) → $archive_file"
  
  if [ "$DRY_RUN" != "--dry-run" ]; then
    # Move file to archive with preserved name (adds .archived extension)
    mv "$file" "$archive_file"
    ARCHIVED_COUNT=$((ARCHIVED_COUNT + 1))
    ARCHIVED_SIZE=$((ARCHIVED_SIZE + file_size_kb))
  else
    ARCHIVED_COUNT=$((ARCHIVED_COUNT + 1))
    ARCHIVED_SIZE=$((ARCHIVED_SIZE + file_size_kb))
  fi
done < <(find "$CRASH_LOG_DIR" -type f -mtime +0 2>/dev/null)

if [ "$ARCHIVED_COUNT" -gt 0 ]; then
  log_info "Archived $ARCHIVED_COUNT files (${ARCHIVED_SIZE}KB) to $ARCHIVE_DIR"
else
  log_info "No files older than 24 hours found"
fi

# Step 2: Check directory size and enforce limit
CURRENT_SIZE_KB=$(du -sk "$CRASH_LOG_DIR" 2>/dev/null | cut -f1)
CURRENT_SIZE_MB=$((CURRENT_SIZE_KB / 1024))
SIZE_LIMIT_KB=$((SIZE_LIMIT_MB * 1024))

log_info "Crash log directory size: ${CURRENT_SIZE_MB}MB (limit: ${SIZE_LIMIT_MB}MB)"

if [ "$CURRENT_SIZE_KB" -gt "$SIZE_LIMIT_KB" ]; then
  log_warn "Directory exceeds size limit! Current: ${CURRENT_SIZE_MB}MB, Limit: ${SIZE_LIMIT_MB}MB"
  
  # Count how many MB over limit
  OVER_BY_KB=$((CURRENT_SIZE_KB - SIZE_LIMIT_KB))
  OVER_BY_MB=$((OVER_BY_KB / 1024))
  log_warn "Need to free at least ${OVER_BY_MB}MB"
  
  # Sort files by modification time and archive the oldest ones until under limit
  EXTRA_ARCHIVED=0
  while [ "$CURRENT_SIZE_KB" -gt "$SIZE_LIMIT_KB" ]; do
    # Get oldest file
    oldest_file=$(find "$CRASH_LOG_DIR" -type f -printf '%T@ %p\n' 2>/dev/null | sort -n | head -1 | cut -d' ' -f2-)
    
    if [ -z "$oldest_file" ]; then
      log_error "Cannot free more space - no files to archive"
      break
    fi
    
    file_size=$(stat -f%z "$oldest_file" 2>/dev/null || stat -c%s "$oldest_file" 2>/dev/null)
    file_size_kb=$((file_size / 1024))
    
    log_info "Archiving oversized file: $(basename "$oldest_file") (${file_size_kb}KB)"
    
    if [ "$DRY_RUN" != "--dry-run" ]; then
      base_name=$(basename "$oldest_file")
      archive_file="$ARCHIVE_DIR/${base_name}.archived"
      mv "$oldest_file" "$archive_file"
      EXTRA_ARCHIVED=$((EXTRA_ARCHIVED + 1))
    fi
    
    CURRENT_SIZE_KB=$((CURRENT_SIZE_KB - file_size_kb))
  done
  
  if [ "$EXTRA_ARCHIVED" -gt 0 ]; then
    log_info "Force-archived $EXTRA_ARCHIVED additional files to comply with size limit"
  fi
else
  log_info "Directory size is within limits"
fi

# Step 3: Archive cleanup - compress old archives if directory gets too large
ARCHIVE_SIZE_KB=$(du -sk "$ARCHIVE_DIR" 2>/dev/null | cut -f1)
ARCHIVE_SIZE_MB=$((ARCHIVE_SIZE_KB / 1024))

log_info "Archive directory size: ${ARCHIVE_SIZE_MB}MB"

COMPRESSED_COUNT=0
COMPRESSED_SIZE_KB=0
ORIGINAL_SIZE_KB=0

if [ "$ARCHIVE_SIZE_MB" -gt "$ARCHIVE_COMPRESSION_THRESHOLD_MB" ]; then
  log_info "Archive directory exceeds ${ARCHIVE_COMPRESSION_THRESHOLD_MB}MB threshold - compressing old archives..."
  
  # Find all uncompressed .archived files (not .tar.gz) and compress them
  while IFS= read -r file; do
    if [ -z "$file" ]; then
      continue
    fi
    
    # Skip already compressed files
    if [[ "$file" == *.tar.gz ]]; then
      log_debug "Skipping already compressed: $file"
      continue
    fi
    
    file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    original_size_kb=$((file_size / 1024))
    base_name=$(basename "$file")
    
    # Create compressed filename (remove .archived if present, add .tar.gz)
    compressed_name="${base_name%.archived}.tar.gz"
    compressed_path="$COMPRESSED_ARCHIVE_DIR/$compressed_name"
    
    log_debug "Compressing: $file (${original_size_kb}KB) → $compressed_path"
    
    if [ "$DRY_RUN" != "--dry-run" ]; then
      # Create tar.gz archive with single file
      if tar -czf "$compressed_path" -C "$(dirname "$file")" "$(basename "$file")" 2>/dev/null; then
        # Get compressed size
        compressed_size=$(stat -f%z "$compressed_path" 2>/dev/null || stat -c%s "$compressed_path" 2>/dev/null)
        compressed_size_kb=$((compressed_size / 1024))
        
        # Calculate compression ratio (handle very small files)
        if [ "$original_size_kb" -gt 0 ]; then
          compression_ratio=$(( (100 * (original_size_kb - compressed_size_kb)) / original_size_kb ))
        else
          compression_ratio=0
        fi
        
        # Remove original file only after successful compression
        rm "$file"
        
        COMPRESSED_COUNT=$((COMPRESSED_COUNT + 1))
        COMPRESSED_SIZE_KB=$((COMPRESSED_SIZE_KB + compressed_size_kb))
        ORIGINAL_SIZE_KB=$((ORIGINAL_SIZE_KB + original_size_kb))
        
        log_debug "Compressed: ${original_size_kb}KB → ${compressed_size_kb}KB (${compression_ratio}% reduction)"
      else
        log_warn "Failed to compress $file - skipping"
      fi
    else
      COMPRESSED_COUNT=$((COMPRESSED_COUNT + 1))
      COMPRESSED_SIZE_KB=$((COMPRESSED_SIZE_KB + (original_size_kb / 10)))  # Estimate ~90% savings
      ORIGINAL_SIZE_KB=$((ORIGINAL_SIZE_KB + original_size_kb))
    fi
  done < <(find "$ARCHIVE_DIR" -type f -name "*.archived" 2>/dev/null)
  
  if [ "$COMPRESSED_COUNT" -gt 0 ]; then
    savings_kb=$((ORIGINAL_SIZE_KB - COMPRESSED_SIZE_KB))
    log_info "Compression complete: $COMPRESSED_COUNT files compressed"
    log_info "  Original: ${ORIGINAL_SIZE_KB}KB → Compressed: ${COMPRESSED_SIZE_KB}KB (Saved: ${savings_kb}KB)"
  else
    log_info "No uncompressed archives found to compress"
  fi
else
  log_debug "Archive directory size (${ARCHIVE_SIZE_MB}MB) below compression threshold (${ARCHIVE_COMPRESSION_THRESHOLD_MB}MB)"
fi

# Summary
if [ "$DRY_RUN" = "--dry-run" ]; then
  log_info "DRY RUN: Would have archived $ARCHIVED_COUNT files (${ARCHIVED_SIZE}KB)"
  if [ "$COMPRESSED_COUNT" -gt 0 ]; then
    log_info "DRY RUN: Would have compressed $COMPRESSED_COUNT files (${ORIGINAL_SIZE_KB}KB → ${COMPRESSED_SIZE_KB}KB)"
  fi
else
  log_info "Cleanup complete: archived $ARCHIVED_COUNT files (${ARCHIVED_SIZE}KB)"
  if [ "$COMPRESSED_COUNT" -gt 0 ]; then
    savings_kb=$((ORIGINAL_SIZE_KB - COMPRESSED_SIZE_KB))
    log_info "Compression complete: $COMPRESSED_COUNT files compressed (Saved: ${savings_kb}KB)"
  fi
fi

exit 0
