.PHONY: all prepare deploy destroy nuke

HELMFILE ?= helmfile
SELECT   ?=

all: deploy

# Performs pre-flight checks to validate the cluster state before deployment.
# This target:
# 1. Verifies connectivity to the Kubernetes cluster's API server.
# 2. Ensures at least one service of 'type: LoadBalancer' exists, which is
#    a common prerequisite for ingress controllers to function correctly.
prepare:
	@echo "Checking cluster connectivity..."
	@kubectl cluster-info > /dev/null || (echo "Error: Cannot connect to Kubernetes cluster. Check your kubeconfig." && exit 1)
	@echo "Pre-flight checks passed."

# Deploys the entire stack declaratively using the helmfile.yaml as the
# single source of truth. This command is dependency-aware and idempotent.
#
# Note: A 'make repos' target is not needed. The 'helmfile sync' command
# automatically adds and updates any repositories defined in the helmfile.
#
# The deployment runs in two stages:
# 1. Isolates the 'prepare' release to securely inject the Cloudflare token.
# 2. Syncs all other releases, relying on the 'needs' graph to determine
#    the correct deployment order automatically.
deploy: prepare
	$(HELMFILE) -l name=prepare sync
	$(HELMFILE) -l 'name!=prepare' sync $(SELECT)

# Gracefully uninstalls all Helm releases defined in the helmfile.yaml. It is
# dependency-aware, using the 'needs' graph to automatically determine the
# correct reverse teardown order (e.g., uninstalling applications before the
# storage they depend on). This is the declarative counterpart to 'deploy'.
# Note: This command only uninstalls the Helm releases. It does NOT delete
# the namespaces or any associated Persistent Volume Claims (PVCs). For a
# complete, destructive cleanup that removes entire namespaces, use 'nuke'.
destroy:
	-$(HELMFILE) destroy

# Hard reset: delete namespaces and wait (Caution: removes PVCs in those namespaces)
nuke:
	@set -eu; \
	namespaces="$$( $(HELMFILE) list --output=json \
		| jq --raw-output '.[].namespace | select(. != null and . != "")' \
		| sort --unique )"; \
	if [ -z "$$namespaces" ]; then \
		echo "No namespaces discovered from helmfile."; \
		exit 0; \
	fi; \
	for ns in $$namespaces; do \
		echo "Deleting namespace $$ns..."; \
		kubectl delete namespace $$ns --ignore-not-found=true --wait=false; \
	done; \
	for ns in $$namespaces; do \
		kubectl wait namespace/$$ns --for=delete --timeout=180s 2>/dev/null || true; \
	done
