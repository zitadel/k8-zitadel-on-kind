# Zitadel Local Development Setup

This project demonstrates how to run Zitadel locally with a complete observability stack - showing you all the bells and
whistles of a modern identity platform deployment. It's a comprehensive example setup for developers who want to see how
Zitadel integrates with monitoring, logging, and tracing systems in a realistic Kubernetes environment.

The setup includes everything you'd expect in a production Zitadel deployment: automatic TLS certificates, comprehensive
telemetry collection, distributed tracing, structured logging, and metrics dashboards. While this configuration
prioritizes ease of setup over production security, it provides a complete picture of how all the pieces fit together.

The stack demonstrates:

- Zitadel's OpenTelemetry tracing integration
- Log aggregation from Kubernetes applications
- Metrics collection and visualization
- Automatic certificate management
- Service mesh communication patterns
- Database integration and monitoring

This is perfect for developers evaluating Zitadel, learning about observability patterns, or building applications that
need to integrate with a fully-instrumented identity provider.

### Architecture

This stack uses carefully selected tools that work together to provide a complete observability experience with minimal
operational overhead:

**OpenObserve** replaces the traditional three-pillar approach (Prometheus + Jaeger + ELK stack) with a single unified
backend. Unlike managing separate systems for metrics, traces, and logs, OpenObserve ingests all telemetry types through
standard protocols (OTLP, Prometheus Remote Write, structured JSON). This dramatically reduces the complexity of running
multiple databases, managing different query languages, and correlating data across systems. For a Zitadel demo
environment, this means you get comprehensive observability without the operational burden of a full Grafana +
Prometheus + Jaeger setup.

**Traefik** handles ingress and automatic certificate management through its native ACME integration. Unlike
nginx-ingress which requires separate cert-manager installations, Traefik includes built-in Let's Encrypt support with
DNS-01 challenges. This means wildcard certificates and automatic renewal work out of the box with just Cloudflare API
tokens. For local development with real domains, this eliminates the complexity of certificate provisioning while
providing production-like TLS behavior.

**Vector** serves as the log collection agent because it excels at parsing and normalizing diverse log formats from
Kubernetes workloads. While alternatives like Fluent Bit focus on lightweight forwarding, Vector includes powerful
transformation capabilities that clean up application logs before they reach OpenObserve. The configuration includes
parsers for Zitadel, etcd, Prometheus, and other common Kubernetes components, ensuring structured, searchable logs
rather than raw text dumps.

This architecture provides a production-representative observability stack while keeping the deployment simple enough
for local development and learning.

### Prerequisites

- Kubernetes cluster (tested with Docker Desktop)
- Helmfile CLI installed
- kubectl configured for your cluster
- A domain managed by Cloudflare (e.g., `test.io`, `example.com`)
- Cloudflare API tokens with appropriate permissions:
  - Zone API token with `Zone:Read` permissions for your domain
  - DNS API token with `Zone:Read` and `DNS:Edit` permissions for your domain

  For creating these tokens, follow
  the [Cloudflare API Token documentation](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
  to create custom tokens with the specific permissions listed above for your domain's zone.

### Configuration

Copy the example environment file and update it with your specific values:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration details.

### Usage

#### Deploy the Stack

```bash
source .env
make deploy
```

#### Available Make Commands

**`make deploy`**
Deploys the entire stack in dependency-aware order. First injects the Cloudflare API token into the 'prepare' release,
then syncs all other releases using the dependency graph defined in helmfile.yaml.

**`make destroy`**
Gracefully uninstalls all Helm releases while preserving namespaces and Persistent Volume Claims. Uses reverse
dependency order to safely tear down the stack.

**`make nuke`**
Complete destructive reset - deletes all namespaces (traefik-system, monitoring, zitadel, observability) and their
associated PVCs, then redeploys the entire stack. Use with caution as this removes all data.

**`make status`** (if available)
Shows the status of all releases in the helmfile.

## Important Notes

### Host Header Requirement

The ingresses are configured for `Host: localhost`. Access must be via:

- `http://localhost` (works automatically)
- NOT `http://172.20.0.5` (will timeout due to host header mismatch)

### Login Process

1. Navigate to: `http://localhost/ui/console?login_hint=zitadel-admin@zitadel.localhost`
2. Enter password: `Password1!`
3. Access the Zitadel management console

### Service Access (for debugging)

```bash
# Direct access to Zitadel
kubectl port-forward -n zitadel svc/zitadel 8080:8080
# Visit: http://localhost:8080

# Direct access to Login service
kubectl port-forward -n zitadel svc/zitadel-login 3000:3000
# Visit: http://localhost:3000

# Traefik dashboard
kubectl port-forward -n traefik-system svc/traefik 8081:8080
# Visit: http://localhost:8081/dashboard/
```

## Configuration Details

### Traefik Configuration

- Service type: LoadBalancer (works with Docker Desktop)
- RBAC enabled for cross-namespace access
- Default ingress class enabled

### Zitadel Configuration

- External domain: `localhost`
- External port: 80
- TLS disabled (for local development)
- PostgreSQL backend with insecure connection
- FirstInstance admin user auto-created

### PostgreSQL Configuration

- Trust authentication enabled (`host all all all trust`)
- Dedicated database and user for Zitadel
- Persistent storage via StatefulSet

## Security Notes

⚠️ **This configuration is for LOCAL DEVELOPMENT ONLY**

- PostgreSQL uses trust authentication
- TLS is disabled
- Default passwords are used
- No network policies or security restrictions

For production deployment, enable TLS, use proper authentication, and follow security best practices.

## Clean Up

```bash
# Remove all resources
pulumi destroy --yes

# Verify cleanup
kubectl get all -n zitadel
kubectl get all -n traefik-system
```

# Caveats

#### Not many metrics

Zitadel does not expose any custom metrics. This can be checked the following command

```
kubectl run curl-test --rm -i --tty --restart=Never --image=curlimages/curl -n zitadel -- curl -s http://zitadel:8080/debug/metrics | grep "^# HELP" | awk '{print $3}' | sort
```

```
➜ kubectl run curl-test --rm -i --tty --restart=Never --image=curlimages/curl -n zitadel -- curl -s http://zitadel:8080/debug/metrics | grep "^# HELP" | awk '{print $3}' | sort
go_gc_duration_seconds
go_gc_gogc_percent
go_gc_gomemlimit_bytes
go_goroutines
go_info
go_memstats_alloc_bytes
go_memstats_alloc_bytes_total
go_memstats_buck_hash_sys_bytes
go_memstats_frees_total
go_memstats_gc_sys_bytes
go_memstats_heap_alloc_bytes
go_memstats_heap_idle_bytes
go_memstats_heap_inuse_bytes
go_memstats_heap_objects
go_memstats_heap_released_bytes
go_memstats_heap_sys_bytes
go_memstats_last_gc_time_seconds
go_memstats_mallocs_total
go_memstats_mcache_inuse_bytes
go_memstats_mcache_sys_bytes
go_memstats_mspan_inuse_bytes
go_memstats_mspan_sys_bytes
go_memstats_next_gc_bytes
go_memstats_other_sys_bytes
go_memstats_stack_inuse_bytes
go_memstats_stack_sys_bytes
go_memstats_sys_bytes
go_sched_gomaxprocs_threads
go_threads
grpc_server_grpc_status_code_total
grpc_server_request_counter_total
grpc_server_total_request_counter_total
process_cpu_seconds_total
process_max_fds
process_network_receive_bytes_total
process_network_transmit_bytes_total
process_open_fds
process_resident_memory_bytes
process_start_time_seconds
process_virtual_memory_bytes
process_virtual_memory_max_bytes
projection_events_processed_total
promhttp_metric_handler_requests_in_flight
promhttp_metric_handler_requests_total
target_info
```

#### ETCD logs messy logs

https://github.com/etcd-io/etcd/issues/13295

Once docker desktop switches to 3.6 then we can ditcha that grok hell

➜ kubectl describe pod etcd-desktop-control-plane -n kube-system | grep Image:

    Image:         registry.k8s.io/etcd:3.5.21-0

The current logs from etcd are like

```
{"level":"info","ts":"2025-09-08T06:09:09.866107Z","caller":"etcdserver/server.go:2569","msg":"compacted Raft logs","compact-index":475052}
```

#### Dashboards cannot be pre-installed

https://github.com/openobserve/openobserve/issues/7073
