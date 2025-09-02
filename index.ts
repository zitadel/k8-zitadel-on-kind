import * as k8s from "@pulumi/kubernetes";
import * as time from "@pulumiverse/time";

const ns = new k8s.core.v1.Namespace("zitadel", {
	metadata: {name: "zitadel"},
});

const traefik_ns = new k8s.core.v1.Namespace("traefik-system", {
	metadata: {name: "traefik-system"},
});

const monitoring_ns = new k8s.core.v1.Namespace("monitoring", {
	metadata: {name: "monitoring"},
});

const traefik = new k8s.helm.v3.Chart("traefik", {
	namespace: traefik_ns.metadata.name,
	chart: "traefik",
	version: "37.0.0",
	fetchOpts: {
		repo: "https://traefik.github.io/charts",
	},
	values: {
		api: {
			dashboard: true,
		},
		service: {
			type: "LoadBalancer",
		},
		deployment: {
			replicas: 1,
		},
		ingressRoute: {
			dashboard: {
				enabled: true,
				matchRule: "Host(`traefik.dev.mrida.ng`)",
				entryPoints: ["web"]
			},
		},
		metrics: {
			prometheus: {
				addEntryPointsLabels: true,
				addServicesLabels: true,
			},
		},
		ports: {
			web: {
				port: 8000,
				expose: {
					default: true,
				},
				exposedPort: 80,
			},
			websecure: {
				port: 8443,
				expose: {
					default: true,
				},
				exposedPort: 443,
			},
			metrics: {
				port: 9100,
				expose: {
					default: false,
				},
				protocol: "TCP",
			},
		},
	},
}, {dependsOn: traefik_ns});

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
			pgHbaConfiguration: `
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
host    all             all             all                     trust
`,
		},
	},
}, {dependsOn: ns});

const delay = new time.Sleep("postgres-delay", {
	createDuration: "120s",
}, {dependsOn: pg});

const prometheus = new k8s.helm.v3.Chart("prometheus", {
	namespace: monitoring_ns.metadata.name,
	chart: "prometheus",
	fetchOpts: {
		repo: "https://prometheus-community.github.io/helm-charts",
	},
	values: {
		server: {
			persistentVolume: {
				enabled: false
			},
			ingress: {
				enabled: true,
				ingressClassName: "traefik",
				hosts: ["prometheus.dev.mrida.ng"],
				path: "/",
				pathType: "Prefix"
			}
		},
		alertmanager: {
			enabled: false
		},
		nodeExporter: {
			enabled: false
		},
		pushgateway: {
			enabled: false
		},
		extraScrapeConfigs: `
- job_name: 'zitadel'
  static_configs:
    - targets: ['zitadel.zitadel.svc.cluster.local:8080']
  metrics_path: '/debug/metrics'
  scrape_interval: 30s
        `
	}
}, {dependsOn: monitoring_ns});

const grafana = new k8s.helm.v3.Chart("grafana", {
	namespace: monitoring_ns.metadata.name,
	chart: "grafana",
	fetchOpts: {
		repo: "https://grafana.github.io/helm-charts",
	},
	values: {
		adminPassword: "admin123",
		persistence: {
			enabled: false
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
		ingress: {
			enabled: true,
			ingressClassName: "traefik",
			hosts: ["grafana.dev.mrida.ng"],
			path: "/",
			pathType: "Prefix"
		}
	}
}, {dependsOn: [monitoring_ns, prometheus]});

const zitadel = new k8s.helm.v3.Chart("zitadel", {
	namespace: ns.metadata.name,
	path: "/Users/mridang/Code/zitadel/zitadel-charts/charts/zitadel",
	// chart: "zitadel",
	// version: "9.0.0",
	// fetchOpts: {
	// 	repo: "https://charts.zitadel.com",
	// },
	values: {
		image: {
			tag: "v4.0.2"
		},
		replicaCount: 2,
		zitadel: {
			masterkey: "MyVerySecretMasterKeyMustBe32Byt",
			configmapConfig: {
				ExternalPort: 80,
				ExternalSecure: false,
				ExternalDomain: "zitadel.dev.mrida.ng",
				TLS: {Enabled: false},
				Database: {
					Postgres: {
						Host: "postgres-postgresql",
						Port: 5432,
						Database: "zitadel",
						User: {
							Username: "zitadel",
							Password: "zitadel",
							SSL: {Mode: "disable"},
						},
						Admin: {
							Username: "postgres",
							Password: "postgres",
							SSL: {Mode: "disable"},
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
		ingress: {
			enabled: true,
		},
		login: {
			enabled: true,
			ingress: {
				enabled: true,
			},
		},
		metrics: {
			enabled: true,
			serviceMonitor: {
				enabled: false,
			},
		},
	},
}, {dependsOn: [pg, delay, traefik]});

export const namespace = ns.metadata.name;
export const traefikNamespace = traefik_ns.metadata.name;
export const monitoringNamespace = monitoring_ns.metadata.name;
export const grafanaAccess = "http://grafana.dev.mrida.ng";
export const prometheusAccess = "http://prometheus.dev.mrida.ng";
export const zitadelAccess = "http://zitadel.dev.mrida.ng";
export const traefikAccess = "http://traefik.dev.mrida.ng";
export const credentials = "admin / admin123";
