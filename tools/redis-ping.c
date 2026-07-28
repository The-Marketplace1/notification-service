/*
 * redis-ping.c — Lightweight TCP Redis connectivity check
 *
 * Opens a raw TCP connection to Redis, sends the inline "PING\r\n"
 * command, and waits for "+PONG" in the response.
 *
 *   Exit 0  — Redis is reachable and responding
 *   Exit 1  — Redis is unreachable, timed out, or returned an error
 *
 * Usage:
 *   ./tools/bin/redis-ping [host] [port]
 *
 * Defaults:
 *   host = 127.0.0.1  (override via REDIS_HOST env or first arg)
 *   port = 6379       (override via REDIS_PORT env or second arg)
 *
 * The script also honours REDIS_URL (redis://[:password@]host:port)
 * to extract host and port automatically.
 *
 * Used by:
 *   scripts/preflight.sh  — before starting the Node.js process
 *   Dockerfile HEALTHCHECK (optional, for Redis dependency gating)
 */

#include <arpa/inet.h>
#include <errno.h>
#include <netdb.h>
#include <netinet/in.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#define TIMEOUT_SEC   3
#define REDIS_CMD     "*1\r\n$4\r\nPING\r\n"
#define PONG_REPLY    "+PONG"
#define BUF_SIZE      64
#define DEFAULT_HOST  "127.0.0.1"
#define DEFAULT_PORT  6379

/*
 * Parse redis://[:password@]host:port into host and port.
 * Returns 0 on success, -1 if the URL cannot be parsed.
 */
static int parse_redis_url(const char *url, char *host_out, size_t host_len,
                            int *port_out) {
    /* Skip scheme */
    const char *p = strstr(url, "://");
    if (!p) return -1;
    p += 3;

    /* Skip optional :password@ */
    const char *at = strrchr(p, '@');
    if (at) p = at + 1;

    /* Extract host:port */
    const char *colon = strrchr(p, ':');
    if (!colon) {
        strncpy(host_out, p, host_len - 1);
        host_out[host_len - 1] = '\0';
        *port_out = DEFAULT_PORT;
    } else {
        size_t hlen = (size_t)(colon - p);
        if (hlen >= host_len) hlen = host_len - 1;
        strncpy(host_out, p, hlen);
        host_out[hlen] = '\0';
        *port_out = atoi(colon + 1);
    }

    return (*port_out > 0 && *port_out <= 65535) ? 0 : -1;
}

static int set_timeout(int fd, int seconds) {
    struct timeval tv;
    tv.tv_sec  = seconds;
    tv.tv_usec = 0;
    if (setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv)) < 0) return -1;
    if (setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv)) < 0) return -1;
    return 0;
}

static int resolve_host(const char *hostname, char *out_ip, size_t out_len) {
    struct addrinfo hints, *res;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family   = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    int rc = getaddrinfo(hostname, NULL, &hints, &res);
    if (rc != 0) {
        fprintf(stderr, "redis-ping: DNS lookup failed for '%s': %s\n",
                hostname, gai_strerror(rc));
        return -1;
    }
    struct sockaddr_in *addr_in = (struct sockaddr_in *)res->ai_addr;
    inet_ntop(AF_INET, &addr_in->sin_addr, out_ip, (socklen_t)out_len);
    freeaddrinfo(res);
    return 0;
}

int main(int argc, char *argv[]) {
    char hostname[256] = DEFAULT_HOST;
    int  port          = DEFAULT_PORT;

    /* 1. Try REDIS_URL env first */
    const char *redis_url = getenv("REDIS_URL");
    if (redis_url) {
        if (parse_redis_url(redis_url, hostname, sizeof(hostname), &port) != 0) {
            fprintf(stderr, "redis-ping: could not parse REDIS_URL '%s', "
                            "using defaults\n", redis_url);
            strncpy(hostname, DEFAULT_HOST, sizeof(hostname) - 1);
            port = DEFAULT_PORT;
        }
    }

    /* 2. CLI args override everything */
    if (argc >= 2) strncpy(hostname, argv[1], sizeof(hostname) - 1);
    if (argc >= 3) port = atoi(argv[2]);

    hostname[sizeof(hostname) - 1] = '\0';

    if (port <= 0 || port > 65535) {
        fprintf(stderr, "redis-ping: invalid port %d\n", port);
        return 1;
    }

    /* --- Resolve hostname --- */
    char ip[INET_ADDRSTRLEN] = {0};
    if (resolve_host(hostname, ip, sizeof(ip)) != 0) return 1;

    /* --- Open socket --- */
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { perror("redis-ping: socket"); return 1; }
    if (set_timeout(fd, TIMEOUT_SEC) != 0) {
        perror("redis-ping: setsockopt");
        close(fd);
        return 1;
    }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port   = htons((uint16_t)port);
    if (inet_pton(AF_INET, ip, &addr.sin_addr) != 1) {
        fprintf(stderr, "redis-ping: inet_pton failed\n");
        close(fd);
        return 1;
    }

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        fprintf(stderr, "redis-ping: cannot connect to %s:%d — %s\n",
                hostname, port, strerror(errno));
        close(fd);
        return 1;
    }

    /* --- Send RESP PING --- */
    const char *cmd = REDIS_CMD;
    if (send(fd, cmd, strlen(cmd), 0) < 0) {
        perror("redis-ping: send");
        close(fd);
        return 1;
    }

    /* --- Read response --- */
    char buf[BUF_SIZE];
    memset(buf, 0, sizeof(buf));
    ssize_t n = recv(fd, buf, sizeof(buf) - 1, 0);
    close(fd);

    if (n <= 0) {
        fprintf(stderr, "redis-ping: no response from %s:%d\n", hostname, port);
        return 1;
    }

    if (strncmp(buf, PONG_REPLY, strlen(PONG_REPLY)) == 0) {
        printf("redis-ping: PONG from %s:%d\n", hostname, port);
        return 0;
    }

    fprintf(stderr, "redis-ping: unexpected response from %s:%d: %.*s\n",
            hostname, port, (int)n, buf);
    return 1;
}
