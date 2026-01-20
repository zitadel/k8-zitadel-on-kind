# Zitadel on Kubernetes Reference Architecture

A demo deployment of Zitadel with comprehensive observability, demonstrating how to run a modern
identity platform on Kubernetes with automatic TLS, distributed tracing, structured logging, and metrics collection.

⚠️ **This is a demonstration setup optimized for local development and learning.** It uses trust authentication for
PostgreSQL, default passwords, and disabled TLS for convenience. Production deployments require proper authentication,
secret management, network policies, high availability configuration, and operational best practices like backups,
monitoring, and security hardening.

While optimized for local development on Kind, the architecture mirrors production patterns: Traefik with ACME DNS-01
for TLS, OpenTelemetry for distributed tracing, unified observability with OpenObserve, and structured log collection
with Vector.

### Architecture

This demonstration is built with carefully selected components that balance simplicity, functionality, and production
relevance. Each component was chosen to minimize operational complexity while showcasing realistic patterns for identity
management, observability, and infrastructure automation.

**[OpenObserve](https://openobserve.ai/)** replaces the traditional three-pillar approach (Prometheus + Jaeger + ELK)
with a unified backend. Instead of managing separate systems for metrics, traces, and logs, OpenObserve ingests all
telemetry through standard
protocols ([OTLP](https://opentelemetry.io/docs/specs/otlp/), [Prometheus Remote Write](https://prometheus.io/docs/concepts/remote_write_spec/),
JSON). This eliminates the operational complexity of running multiple databases, learning different query languages, and
correlating data across systems.

**[Traefik](https://traefik.io/)** handles ingress and automatic certificate management through
native [ACME integration](https://doc.traefik.io/traefik/https/acme/). Unlike nginx-ingress requiring separate
cert-manager installations, Traefik includes built-in Let's Encrypt support
with [DNS-01 challenges](https://letsencrypt.org/docs/challenge-types/#dns-01-challenge). Wildcard certificates and
automatic renewal work out of the box with Cloudflare API tokens, providing production-like TLS without provisioning
complexity.

**[Vector](https://vector.dev/)** collects and transforms logs from Kubernetes workloads. While alternatives like Fluent
Bit focus on lightweight forwarding, Vector includes
powerful [transformation capabilities](https://vector.dev/docs/reference/configuration/transforms/) that normalize
diverse log formats before ingestion. The configuration includes parsers for Zitadel, etcd, Prometheus, and other
Kubernetes components, ensuring structured, searchable logs.

**[OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)** aggregates telemetry from all
sources. [Zitadel exports traces](https://zitadel.com/docs/self-hosting/manage/configure/tracing) directly to OTel
Collector, which forwards to OpenObserve. The collector
also [scrapes Prometheus metrics](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/receiver/prometheusreceiver)
from annotated pods and services, providing a single pipeline for all telemetry.

**[MetalLB](https://metallb.universe.tf/)** provides LoadBalancer services in bare-metal and local Kubernetes
environments like Kind. Without MetalLB, services with `type: LoadBalancer` remain in pending state. MetalLB assigns IP
addresses from a configured pool and announces them via [Layer 2 mode](https://metallb.universe.tf/concepts/layer2/) or
BGP, enabling Traefik to expose services externally.

**PostgreSQL** deployment uses
the [Bitnami PostgreSQL Helm chart](https://github.com/bitnami/charts/tree/main/bitnami/postgresql) for simplicity in
this demonstration. For production deployments, consider [CloudNativePG](https://cloudnative-pg.io/), the recommended
Kubernetes-native operator for PostgreSQL. With Bitnami charts being deprecated, CloudNativePG provides modern
declarative configuration, automated backups, high availability, and better integration with Kubernetes primitives.

## Usage

### Prerequisites

You
need [Kind](https://kind.sigs.k8s.io/), [Helmfile](https://helmfile.readthedocs.io/), [kubectl](https://kubernetes.io/docs/tasks/tools/),
and [Docker](https://docs.docker.com/get-docker/) installed. Kind creates a local Kubernetes cluster, Helmfile manages
the deployment, kubectl provides CLI access, and Docker runs the containers.

You also need a domain managed by Cloudflare with API tokens for DNS automation. Create two tokens: one with `Zone:Read`
permission, another with `Zone:Read` and `DNS:Edit` permissions.
Follow [Cloudflare's token creation guide](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
to create scoped tokens for your domain.

💡 **Note:** This setup uses real domains with DNS-01 ACME challenges instead of localhost or `/etc/hosts` modifications.
Real domains let you test production certificate workflows, verify DNS propagation behavior, access services from any
device on your network, and integrate with external webhooks or mobile apps.

### Creating the Cluster

Create a Kind cluster with the provided configuration. This sets up port mappings for HTTP (80) and HTTPS (443).

```bash
kind create cluster --config etc/kind.yaml
```

### Deploying

Copy the example environment file and edit it with your configuration.

```bash
cp .env.example .env
```

Set these values in `.env`:

```bash
CLOUDFLARE_ADMIN_EMAIL=admin@example.com
CLOUDFLARE_API_TOKEN=your-token-here
DOMAIN=dev.example.com
ZITADEL_MASTERKEY=0123456789abcdef0123456789abcdef  # 32 chars, cannot be changed later
```

#### Generating System User Keys

The System API requires RSA keys for JWT authentication. Generate them using openssl:

```bash
# Generate RSA private key
openssl genrsa -out system-user-private.pem 2048

# Extract public key
openssl rsa -in system-user-private.pem -pubout -out system-user-public.pem

# Base64 encode for .env file
echo "ZITADEL_SYSTEMUSER_PRIVATE_KEY=$(base64 -i system-user-private.pem | tr -d '\n')"
echo "ZITADEL_SYSTEMUSER_PUBLIC_KEY=$(base64 -i system-user-public.pem | tr -d '\n')"
```

Add the output to your `.env` file along with a system user ID:

```bash
ZITADEL_SYSTEMUSER_ID=systemuser
ZITADEL_SYSTEMUSER_PRIVATE_KEY=<base64-encoded-private-key>
ZITADEL_SYSTEMUSER_PUBLIC_KEY=<base64-encoded-public-key>
```

The system user has full access to the [Zitadel System API](https://zitadel.com/docs/guides/integrate/zitadel-apis/access-zitadel-system-api), which provides superordinate access across all instances and organizations. Store the private key securely.

Deploy the stack:

```bash
source .env
make deploy
```

First deployment takes 5-10 minutes to pull images, provision LoadBalancer IPs, obtain TLS certificates, initialize
PostgreSQL, and bootstrap Zitadel.

### Accessing the Traefik Dashboard

Traefik dashboard is available at `https://traefik.${DOMAIN}` with no credentials required. Use it to view all
registered ingresses and routes for debugging purposes.

### Viewing Telemetry

Access OpenObserve at `https://openobserve.${DOMAIN}` with email `admin@${DOMAIN}` and password `ChangeMeNow!`. Zitadel
and Traefik export traces to OTel Collector, which forwards them to OpenObserve. Vector collects and parses logs from
all pods (including Zitadel, Traefik, etcd, and OTel Collector) before sending to OpenObserve. OTel Collector also
scrapes Prometheus metrics from annotated pods and services. View traces, logs, and metrics in their respective
OpenObserve sections. Filter traces by `service.name="zitadel"`, logs by `kubernetes_namespace="zitadel"`, and query
metrics with PromQL.

### Accessing Zitadel

Zitadel console is at `https://zitadel.${DOMAIN}/ui/console` with username `zitadel-admin@zitadel.localhost` and
password `Password1!`. Change this password immediately after first login.

### Cleanup

Remove all Helm releases while preserving namespaces and PVCs:

```bash
make destroy
```

Complete teardown including all namespaces and data:

```bash
make nuke
```

Delete the entire Kind cluster:

```bash
kind delete cluster
```

## Known Issues and Caveats

### OpenObserve Dashboard Limitations

OpenObserve does not currently support pre-installed dashboards via configuration. Dashboards must be created through
the UI after deployment.

Tracking issue: https://github.com/openobserve/openobserve/issues/7073

## Contributing

This is a reference architecture for learning and evaluation. For production deployments, fork and adapt to your
requirements.

## Resources

- [Zitadel Documentation](https://zitadel.com/docs)
- [Zitadel Helm Charts](https://github.com/zitadel/zitadel-charts)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [OpenObserve Documentation](https://openobserve.ai/docs/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [Vector Documentation](https://vector.dev/docs/)
- [Helmfile Documentation](https://helmfile.readthedocs.io/)

## License

Apache 2.0
