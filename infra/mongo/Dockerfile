FROM mongo:7
# Listen on all interfaces (required for Fly 6PN private networking) and
# enforce auth. On a fresh volume the image entrypoint reads
# MONGO_INITDB_ROOT_USERNAME/PASSWORD and creates the root user before
# starting mongod with --auth.
# --ipv6 is required so mongod also binds the IPv6 interface — Fly's private
# 6PN network (building-app-mongo.internal) is IPv6-only. Without it, --bind_ip_all
# binds 0.0.0.0 (IPv4) only and peers over 6PN get connection-refused.
CMD ["mongod", "--bind_ip_all", "--ipv6", "--auth"]
