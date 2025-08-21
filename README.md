# Zitadel Local Development Setup

This guide documents the complete setup of a local Zitadel identity platform using Pulumi, Kubernetes (Docker Desktop), Traefik, and PostgreSQL.

## Prerequisites

- Docker Desktop with Kubernetes enabled
- Pulumi CLI installed
- kubectl configured for Docker Desktop context

## Architecture

- **Kubernetes**: Docker Desktop (single-node cluster)
- **Ingress Controller**: Traefik (LoadBalancer service)
- **Database**: PostgreSQL (Bitnami Helm chart)
- **Identity Platform**: Zitadel v4.0.0 (Helm chart v9.0.0)
- **Orchestration**: Pulumi

## Deployment

```bash
# Deploy the complete stack
pulumi up --yes
```

The deployment creates:

- `traefik-system` namespace with Traefik ingress controller
- `zitadel` namespace with PostgreSQL and Zitadel services
- Proper RBAC permissions for cross-namespace service discovery
- LoadBalancer service for external access

## Services Deployed

### Traefik (traefik-system namespace)

- **Service Type**: LoadBalancer
- **External IP**: Assigned by Docker Desktop
- **Ports**: 80:80, 443:443

### PostgreSQL (zitadel namespace)

- **Chart**: bitnami/postgresql v12.10.0
- **Database**: `zitadel`
- **User**: `zitadel` / `zitadel`
- **Admin**: `postgres` / `postgres`

### Zitadel (zitadel namespace)

- **Main Service**: ClusterIP on port 8080
- **Login Service**: ClusterIP on port 3000
- **Version**: v4.0.0
- **Ingress**: Configured for `localhost` domain

## Access Information

### URLs

- **Zitadel Console**: `http://localhost/ui/console?login_hint=zitadel-admin@zitadel.localhost`
- **Login Interface**: `http://localhost/ui/v2/login`
- **Main API**: `http://localhost/`

### Default Admin Credentials

- **Username**: `zitadel-admin`
- **Password**: `Password1!`
- **Email**: `admin@localhost`
- **Login Hint**: `zitadel-admin@zitadel.localhost`

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

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n zitadel
kubectl get pods -n traefik-system
```

### Check Service Discovery

```bash
kubectl get svc -n zitadel
kubectl get ingress -n zitadel
```

### Check Logs

```bash
# Zitadel logs
kubectl logs -n zitadel deployment/zitadel --tail=50

# Traefik logs
kubectl logs -n traefik-system deployment/traefik --tail=50

# Setup job logs (if login fails)
kubectl logs -n zitadel job/zitadel-setup --tail=50
```

### RBAC Verification

```bash
# Verify Traefik can see services
kubectl get svc -n zitadel --as=system:serviceaccount:traefik-system:traefik
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
