# Makefile — Build C tools for notification-service
#
# Usage:
#   make              — build all tools
#   make healthcheck  — build only the HTTP health probe
#   make redis-ping   — build only the Redis ping utility
#   make clean        — remove compiled binaries
#
# Requirements:
#   gcc (or clang — set CC=clang make)
#
# Output binaries land in tools/bin/ and are gitignored.

CC      ?= gcc
CFLAGS  := -std=c11 -Wall -Wextra -Wpedantic -O2 -D_POSIX_C_SOURCE=200112L
LDFLAGS :=

TOOLS_SRC := tools
TOOLS_BIN := tools/bin

TARGETS := $(TOOLS_BIN)/healthcheck $(TOOLS_BIN)/redis-ping

.PHONY: all clean healthcheck redis-ping

all: $(TOOLS_BIN) $(TARGETS)
	@echo "✓ All tools built in $(TOOLS_BIN)/"

$(TOOLS_BIN):
	mkdir -p $(TOOLS_BIN)

$(TOOLS_BIN)/healthcheck: $(TOOLS_SRC)/healthcheck.c | $(TOOLS_BIN)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)
	@echo "  built: $@"

$(TOOLS_BIN)/redis-ping: $(TOOLS_SRC)/redis-ping.c | $(TOOLS_BIN)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)
	@echo "  built: $@"

healthcheck: $(TOOLS_BIN)/healthcheck

redis-ping: $(TOOLS_BIN)/redis-ping

clean:
	rm -rf $(TOOLS_BIN)
	@echo "✓ Cleaned $(TOOLS_BIN)/"
