# file: Makefile

.PHONY: all repos deploy deploy-operators deploy-crds deploy-storage deploy-apps \
        destroy status orphans nuke

HELMFILE ?= helmfile
SELECT   ?=

all: deploy

repos:
	helm repo add traefik https://traefik.github.io/charts
	helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
	helm repo add bitnami https://charts.bitnami.com/bitnami
	helm repo add zitadel https://charts.zitadel.com
	helm repo update

# One-shot, DAG-based (uses needs + labels)
deploy: repos
	@test -n "$$CLOUDFLARE_API_TOKEN" || (echo "CLOUDFLARE_API_TOKEN not set"; exit 1)
	$(HELMFILE) -l name=prepare sync --args="--set-string cfToken=$$CLOUDFLARE_API_TOKEN"
	$(HELMFILE) -l 'name!=prepare' sync $(SELECT)

# Explicit waves (nice on fresh clusters)
deploy-operators: repos
	$(HELMFILE) -l phase=operators sync

deploy-crds: repos
	$(HELMFILE) -l phase=crd-objects sync

deploy-storage: repos
	$(HELMFILE) -l phase=storage sync

deploy-apps: repos
	$(HELMFILE) -l phase=apps sync

# Reverse-order destroy (apps -> storage -> crd-objects -> operators)
destroy:
	-$(HELMFILE) -l phase=apps destroy
	-$(HELMFILE) -l phase=storage destroy
	-$(HELMFILE) -l phase=crd-objects destroy
	-$(HELMFILE) -l phase=operators destroy

status:
	kubectl -n traefik-system get pods,svc,ingressroute,middleware
	kubectl -n monitoring get pods,svc,ing
	kubectl -n zitadel get pods,svc

# List resources in our namespaces that are NOT managed by Helm (potential orphans)
orphans:
	@echo "== traefik-system orphans =="
	-kubectl -n traefik-system get $$(kubectl api-resources --namespaced=true -o name | tr '\n' ',' | sed 's/,$$//') -o name -l '!app.kubernetes.io/managed-by'
	@echo "== monitoring orphans =="
	-kubectl -n monitoring get $$(kubectl api-resources --namespaced=true -o name | tr '\n' ',' | sed 's/,$$//') -o name -l '!app.kubernetes.io/managed-by'
	@echo "== zitadel orphans =="
	-kubectl -n zitadel get $$(kubectl api-resources --namespaced=true -o name | tr '\n' ',' | sed 's/,$$//') -o name -l '!app.kubernetes.io/managed-by'

# Hard reset: delete namespaces and wait (Caution: removes PVCs in those namespaces)
nuke:
	-kubectl delete namespace traefik-system monitoring zitadel --ignore-not-found
	-@kubectl wait namespace/traefik-system --for=delete --timeout=180s 2>/dev/null || true
	-@kubectl wait namespace/monitoring --for=delete --timeout=180s 2>/dev/null || true
	-@kubectl wait namespace/zitadel --for=delete --timeout=180s 2>/dev/null || true
	$(MAKE) deploy
