.PHONY: all deploy destroy nuke

HELMFILE ?= helmfile
SELECT   ?=

all: deploy

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
deploy:
	@test -n "$$CLOUDFLARE_API_TOKEN" || (echo "CLOUDFLARE_API_TOKEN not set"; exit 1)
	$(HELMFILE) -l name=prepare sync --args="--set-string cfToken=$$CLOUDFLARE_API_TOKEN"
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
