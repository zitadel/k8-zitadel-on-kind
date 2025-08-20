import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as time from "@pulumiverse/time";

// 1) Namespace for Zitadel
const ns = new k8s.core.v1.Namespace("zitadel", {
	metadata: { name: "zitadel" },
});

// 2) Namespace for Traefik
const traefik_ns = new k8s.core.v1.Namespace("traefik-system", {
	metadata: { name: "traefik-system" },
});

// 3) Namespace for Monitoring (NEW)
const monitoring_ns = new k8s.core.v1.Namespace("monitoring", {
	metadata: { name: "monitoring" },
});

// 4) Install Traefik Ingress Controller - Latest version
const traefik = new k8s.helm.v3.Chart("traefik", {
	namespace: traefik_ns.metadata.name,
	chart: "traefik",
	version: "37.0.0", // Use latest version
	fetchOpts: {
		repo: "https://traefik.github.io/charts",
	},
	values: {
		service: {
			type: "LoadBalancer",
		},
		deployment: {
			replicas: 1,
		},
	},
}, { dependsOn: traefik_ns });

// 5) PostgreSQL
const pg = new k8s.helm.v3.Chart("postgres", {
	namespace: ns.metadata.name,
	chart: "postgresql",
	version: "12.10.0",
	fetchOpts: {
		repo: "https://charts.bitnami.com/bitnami",
	},
	values: {
		auth: {
			username: "zitadel",
			password: "zitadel",
			database: "zitadel",
			postgresPassword: "postgres",
		},
		primary: {
			pgHbaConfiguration: "host all all all trust",
		},
	},
}, { dependsOn: ns });

// 6) Wait for PostgreSQL to be ready
const delay = new time.Sleep("postgres-delay", {
	createDuration: "60s",
}, { dependsOn: pg });

// 7) Prometheus without persistence (NEW)
const prometheus = new k8s.helm.v3.Chart("prometheus", {
	namespace: monitoring_ns.metadata.name,
	chart: "prometheus",
	fetchOpts: {
		repo: "https://prometheus-community.github.io/helm-charts",
	},
	values: {
		server: {
			persistentVolume: {
				enabled: false  // No storage issues
			},
			// Enable ingress for Traefik access
			ingress: {
				enabled: true,
				ingressClassName: "traefik",
				hosts: ["prometheus.localhost"],
				path: "/",
				pathType: "Prefix"
			}
		},
		alertmanager: {
			enabled: false
		},
		nodeExporter: {
			enabled: false  // Avoid port conflicts
		},
		pushgateway: {
			enabled: false
		},
		// Add manual scrape config for Zitadel metrics (ROOT LEVEL)
		extraScrapeConfigs: `
- job_name: 'zitadel'
  static_configs:
    - targets: ['zitadel.zitadel.svc.cluster.local:8080']
  metrics_path: '/debug/metrics'
  scrape_interval: 30s
        `
	}
}, { dependsOn: monitoring_ns });

// 8) Grafana without persistence (NEW)
const grafana = new k8s.helm.v3.Chart("grafana", {
	namespace: monitoring_ns.metadata.name,
	chart: "grafana",
	fetchOpts: {
		repo: "https://grafana.github.io/helm-charts",
	},
	values: {
		adminPassword: "admin123",
		persistence: {
			enabled: false  // No storage issues
		},
		datasources: {
			"datasources.yaml": {
				apiVersion: 1,
				datasources: [{
					name: "Prometheus",
					type: "prometheus",
					url: "http://prometheus-server:80",
					access: "proxy",
					isDefault: true
				}]
			}
		},
		// Enable ingress for Traefik access
		ingress: {
			enabled: true,
			ingressClassName: "traefik",
			hosts: ["grafana.localhost"],
			path: "/",
			pathType: "Prefix"
		}
	}
}, { dependsOn: [monitoring_ns, prometheus] });

// 9) Zitadel with proper ingress configuration
const zitadel = new k8s.helm.v3.Chart(
	"zitadel",
	{
		namespace: ns.metadata.name,
		chart: "zitadel",
		version: "9.0.0", // Use latest chart
		fetchOpts: {
			repo: "https://charts.zitadel.com",
		},
		values: {
			zitadel: {
				masterkey: "MyVerySecretMasterKeyMustBe32Byt", // Exactly 32 bytes
				configmapConfig: {
					ExternalPort: 80,
					ExternalSecure: false,
					ExternalDomain: "localhost",
					TLS: { Enabled: false },
					Database: {
						Postgres: {
							Host: "postgres-postgresql",
							Port: 5432,
							Database: "zitadel",
							User: {
								Username: "zitadel",
								Password: "zitadel",
								SSL: { Mode: "disable" },
							},
							Admin: {
								Username: "postgres",
								Password: "postgres",
								SSL: { Mode: "disable" },
							},
						},
					},
					FirstInstance: {
						Org: {
							Human: {
								UserName: "zitadel-admin",
								Password: "Password1!",
								FirstName: "ZITADEL",
								LastName: "Admin",
								Email: "admin@localhost",
								PasswordChangeRequired: false,
							},
							LoginClient: {
								Machine: {
									Username: "login-client",
									Name: "Automatically Initialized IAM Login Client",
								},
								Pat: {
									ExpirationDate: "2029-01-01T00:00:00Z",
								},
							},
						},
					},
				},
			},
			// Enable ingress
			ingress: {
				enabled: true,
			},
			// Enable login service with ingress
			login: {
				enabled: true,
				ingress: {
					enabled: true,
				},
			},
			// Enable metrics for Prometheus (but disable ServiceMonitor since we're using manual scrape config)
			metrics: {
				enabled: true,
				serviceMonitor: {
					enabled: false,  // Not needed with manual scrape config
				},
			},
		},
	},
	{ dependsOn: [pg, delay, traefik] }
);

export const namespace = ns.metadata.name;
export const traefikNamespace = traefik_ns.metadata.name;

// NEW exports for monitoring
export const monitoringNamespace = monitoring_ns.metadata.name;
export const grafanaAccess = "kubectl port-forward -n monitoring svc/grafana 3000:80";
export const prometheusAccess = "kubectl port-forward -n monitoring svc/prometheus-server 9090:80";
export const credentials = "admin / admin123";
