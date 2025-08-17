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

// 3) Install Traefik Ingress Controller - Latest version
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

// 4) PostgreSQL
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

// 5) Wait for PostgreSQL to be ready
const delay = new time.Sleep("postgres-delay", {
	createDuration: "60s",
}, { dependsOn: pg });

// 6) Zitadel with proper ingress configuration
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
		},
	},
	{ dependsOn: [pg, delay, traefik] }
);

export const namespace = ns.metadata.name;
export const traefikNamespace = traefik_ns.metadata.name;
