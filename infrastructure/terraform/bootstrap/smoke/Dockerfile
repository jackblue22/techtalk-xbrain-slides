FROM busybox:1.37
RUN mkdir -p /www && printf '%s\n' '{"status":"ok","workload":"hanoi-local-zone-smoke"}' > /www/health
EXPOSE 8080
CMD ["httpd", "-f", "-p", "8080", "-h", "/www"]

