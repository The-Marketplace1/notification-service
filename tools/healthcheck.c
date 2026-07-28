/*
 * healthcheck.c — HTTP health probe for notification-service
 *
 * Makes a raw HTTP/1.1 GET request to /notifications/healthz and exits
 * with an appropriate code that container runtimes understand:
 *
 *   Exit 0  — service is "ok" or "degraded" (HTTP server is up and serving)
 *   Exit 1  — service is "unhealthy", connection refused, or timed out
 *
 * Usage:
 *   ./tools/bin/healthcheck [host] [port]
 *
 * Defaults:
 *   host = 127.0.0.1  (override via HEALTHCHECK_HOST env or first arg)
 *   port = 8082       (override via HEALTHCHECK_PORT env or second arg)
 *
 * Docker example:
 *   HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
 *     CMD ["./tools/bin/healthcheck"]
 *
 * Kubernetes liveness probe example:
 *   livenessProbe:
 *     exec:
 *       command: ["./tools/bin/healthcheck"]
 *     initialDelaySeconds: 10
 *     periodSeconds: 15
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

#define TIMEOUT_SEC    5
#define BUFFER_SIZE    4096
#define DEFAULT_HOST   "127.0.0.1"
#define DEFAULT_PORT   8082
#define HEALTH_PATH    "/notifications/healthz"

/* Set SO_RCVTIMEO and SO_SNDTIMEO on socket. */
static int set_timeout(int fd, int seconds) {
    struct timeval tv;
    tv.tv_sec  = seconds;
    tv.tv_usec = 0;
    if (setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv)) < 0) return -1;
    if (setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv)) < 0) return -1;
    return 0;
}

/* Resolve hostname to IPv4 address string. Returns 0 on success. */
static int resolve_host(const char *hostname, char *out_ip, size_t out_len) {
    struct addrinfo hints, *res;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family   = AF_INET;
    hints.ai_socktype = SOCK_STREAM;

    int rc = getaddrinfo(hostname, NULL, &hints, &res);
    if (rc != 0) {
        fprintf(stderr, "healthcheck: DNS lookup failed for '%s': %s\n",
                hostname, gai_strerror(rc));
        return -1;
    }

    struct sockaddr_in *addr = (struct sockaddr_in *)res->ai_addr;
    inet_ntop(AF_INET, &addr->sin_addr, out_ip, (socklen_t)out_len);
    freeaddrinfo(res);
    return 0;
}

/*
 * Scan the HTTP response body for the status field.
 * Returns:
 *   0  if "status":"ok" or "status":"degraded"  (server is serving requests)
 *   1  if "status":"unhealthy" or status field missing
 */
static int parse_status(const char *buf) {
    const char *body = strstr(buf, "\r\n\r\n");
    if (!body) body = buf;

    if (strstr(body, "\"status\":\"ok\""))       return 0;
    if (strstr(body, "\"status\": \"ok\""))      return 0;
    if (strstr(body, "\"status\":\"degraded\"")) return 0;
    if (strstr(body, "\"status\": \"degraded\""))return 0;

    return 1;
}

int main(int argc, char *argv[]) {
    /* --- Resolve host and port from args / env / defaults --- */
    const char *host_arg = (argc >= 2) ? argv[1]
                         : getenv("HEALTHCHECK_HOST");
    const char *port_arg = (argc >= 3) ? argv[2]
                         : getenv("HEALTHCHECK_PORT");

    char hostname[256];
    strncpy(hostname, host_arg ? host_arg : DEFAULT_HOST, sizeof(hostname) - 1);
    hostname[sizeof(hostname) - 1] = '\0';

    int port = port_arg ? atoi(port_arg) : DEFAULT_PORT;
    if (port <= 0 || port > 65535) {
        fprintf(stderr, "healthcheck: invalid port %d\n", port);
        return 1;
    }

    /* --- Resolve hostname to IP --- */
    char ip[INET_ADDRSTRLEN] = {0};
    if (resolve_host(hostname, ip, sizeof(ip)) != 0) {
        return 1;
    }

    /* --- Create TCP socket --- */
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) {
        perror("healthcheck: socket");
        return 1;
    }

    if (set_timeout(fd, TIMEOUT_SEC) != 0) {
        perror("healthcheck: setsockopt");
        close(fd);
        return 1;
    }

    /* --- Connect --- */
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family      = AF_INET;
    addr.sin_port        = htons((uint16_t)port);
    if (inet_pton(AF_INET, ip, &addr.sin_addr) != 1) {
        fprintf(stderr, "healthcheck: inet_pton failed for '%s'\n", ip);
        close(fd);
        return 1;
    }

    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        fprintf(stderr, "healthcheck: cannot connect to %s:%d — %s\n",
                hostname, port, strerror(errno));
        close(fd);
        return 1;
    }

    /* --- Send HTTP GET request --- */
    char request[512];
    snprintf(request, sizeof(request),
             "GET %s HTTP/1.1\r\n"
             "Host: %s:%d\r\n"
             "Connection: close\r\n"
             "\r\n",
             HEALTH_PATH, hostname, port);

    ssize_t sent = send(fd, request, strlen(request), 0);
    if (sent < 0) {
        perror("healthcheck: send");
        close(fd);
        return 1;
    }

    /* --- Read response --- */
    char buf[BUFFER_SIZE];
    memset(buf, 0, sizeof(buf));
    size_t total = 0;

    while (total < sizeof(buf) - 1) {
        ssize_t n = recv(fd, buf + total, sizeof(buf) - 1 - total, 0);
        if (n < 0) {
            if (errno == EAGAIN || errno == EWOULDBLOCK) break; /* timeout */
            perror("healthcheck: recv");
            close(fd);
            return 1;
        }
        if (n == 0) break; /* connection closed */
        total += (size_t)n;
    }

    close(fd);

    if (total == 0) {
        fprintf(stderr, "healthcheck: empty response from %s:%d\n",
                hostname, port);
        return 1;
    }

    /* --- Parse HTTP status line (must be 2xx) --- */
    int http_code = 0;
    if (sscanf(buf, "HTTP/%*s %d", &http_code) != 1) {
        fprintf(stderr, "healthcheck: could not parse HTTP status line\n");
        return 1;
    }

    /* 200 = healthy/degraded, 503 = unhealthy (DB down) */
    if (http_code == 503) {
        fprintf(stderr, "healthcheck: service unhealthy (HTTP 503)\n");
        return 1;
    }

    if (http_code < 200 || http_code >= 300) {
        fprintf(stderr, "healthcheck: unexpected HTTP %d\n", http_code);
        return 1;
    }

    /* --- Inspect JSON body for status field --- */
    int rc = parse_status(buf);
    if (rc == 0) {
        printf("healthcheck: ok (%s:%d HTTP %d)\n", hostname, port, http_code);
    } else {
        fprintf(stderr, "healthcheck: unhealthy status in response body\n");
        fprintf(stderr, "%s\n", buf);
    }

    return rc;
}
