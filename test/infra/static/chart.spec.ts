import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse, parseAllDocuments } from 'yaml';
import { validateEnv } from '../../../src/config/env.validation';
import { Cleanup, REPOSITORY_ROOT, run } from '../support/docker';
import { blockArguments, readText, unquoted, withoutComments } from '../support/hcl';

const CHART = join(REPOSITORY_ROOT, 'k8s/workshop');
const TOOL = join(REPOSITORY_ROOT, 'scripts/tool.sh');
const KIND_CONFIG = join(REPOSITORY_ROOT, 'k8s/kind/cluster.yaml');
const HOOKS = 'pre-install,pre-upgrade';

/** What the deploy passes to the chart in prod: the outputs of Terraform and the commit's image. */
const PROD_DEPLOY = {
  'image.repository': 'registry.example.test/workshop-prod',
  'image.tag': '3f7fda4c9d1e4b8a6f20b1c5d7e9a3b4c5d6e7f8',
  'config.DATABASE_HOST': 'workshop-prod.c1a2b3.us-east-1.rds.amazonaws.com',
  'config.DATABASE_PORT': '5432',
  'config.DATABASE_NAME': 'workshop',
  'config.DATABASE_USER': 'workshop',
  'config.REDIS_HOST': 'workshop-prod.c1a2b3.use1.cache.amazonaws.com',
  'config.REDIS_PORT': '6379',
  'config.APP_PUBLIC_URL': 'http://a1b2c3d4-0123456789.elb.us-east-1.amazonaws.com',
};
/** The two secrets the deploy reads from Secrets Manager, and the script reads from .env. */
const SECRETS = {
  'secrets.DATABASE_PASSWORD': 'Zp4w8s7Qe1Lm0Xc3Vb5N9a2Kd6Rt8Yh1',
  'secrets.JWT_SECRET': '5f0c2b7e9d4a1c8f3b6e0a7d2c9f4b1e8a5d3c0f7b2e9a6d1c4f8b3e0a7d5c2f',
};
/** What the script passes in the local cluster: the image it loaded, and the secrets of .env. */
const LOCAL_DEPLOY = { 'image.tag': 'c0ffee123456', ...SECRETS };

const PROD_IMAGE = `${PROD_DEPLOY['image.repository']}:${PROD_DEPLOY['image.tag']}`;
const LOCAL_IMAGE = `workshop:${LOCAL_DEPLOY['image.tag']}`;
const RDS_BUNDLE = '/app/certs/rds-global-bundle.pem';

interface SecurityContext {
  runAsNonRoot?: boolean;
  runAsUser?: number;
}
interface Probe {
  httpGet?: { path: string; port: string | number };
  timeoutSeconds?: number;
}
interface Container {
  name: string;
  image: string;
  command?: string[];
  args?: string[];
  ports?: Array<{ name?: string; containerPort: number }>;
  envFrom?: Array<{ configMapRef?: { name: string }; secretRef?: { name: string } }>;
  env?: Array<{ name: string; value?: string }>;
  livenessProbe?: Probe;
  readinessProbe?: Probe;
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
  securityContext?: SecurityContext;
}
interface PodTemplate {
  metadata?: { labels?: Record<string, string> };
  spec: { containers: Container[]; securityContext?: SecurityContext };
}
interface Manifest {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  data?: Record<string, string>;
  spec?: {
    replicas?: number;
    type?: string;
    externalTrafficPolicy?: string;
    selector?: Record<string, string>;
    ports?: Array<{ name?: string; port: number; targetPort?: string | number; nodePort?: number }>;
    template?: PodTemplate;
    scaleTargetRef?: { apiVersion: string; kind: string; name: string };
    minReplicas?: number;
    maxReplicas?: number;
    metrics?: Array<{
      type: string;
      resource?: { name: string; target: { type: string; averageUtilization: number } };
    }>;
  };
}
type Workload = Manifest & { spec: { template: PodTemplate } };

const cleanup = new Cleanup();

afterAll(async () => {
  await cleanup.run();
});

/** The Kubernetes minor of prod (1.37), which the cluster, the kind node and these specs share. */
function kubernetesMinor(): string {
  const tfvars = blockArguments(
    withoutComments(readText(join(REPOSITORY_ROOT, 'infra/environments/prod.tfvars'))),
  );
  const minor = unquoted(tfvars.kubernetes_version);
  expect(minor, 'prod.tfvars pins the Kubernetes version').toMatch(/^\d+\.\d+$/);
  return minor as string;
}

function tool(args: string[]) {
  return run(TOOL, args, { cwd: REPOSITORY_ROOT, allowFailure: true });
}

function helm(command: 'template' | 'lint', valuesFile: string, settings: Record<string, string>) {
  return tool([
    ...['helm', command, ...(command === 'template' ? ['workshop'] : ['--strict']), CHART],
    ...['--kube-version', `v${kubernetesMinor()}.0`, '--values', join(CHART, valuesFile)],
    ...(command === 'template' ? ['--namespace', 'workshop'] : []),
    ...Object.entries(settings).flatMap(([key, value]) => ['--set-string', `${key}=${value}`]),
  ]);
}

class Rendered {
  constructor(
    readonly text: string,
    readonly objects: Manifest[],
  ) {}

  of(kind: string): Manifest[] {
    return this.objects.filter((object) => object.kind === kind);
  }

  named(kind: string, name: string): Manifest {
    const found = this.of(kind).find((object) => object.metadata.name === name);
    expect(found, `the render holds the ${kind} ${name}`).toBeDefined();
    return found as Manifest;
  }

  /** The Deployment that runs the image the deploy named, which is the application and not Mailpit. */
  application(image: string): Workload {
    const found = this.of('Deployment').filter((deployment) =>
      deployment.spec?.template?.spec.containers.some((container) => container.image === image),
    );
    expect(found, `one Deployment runs ${image}`).toHaveLength(1);
    return found[0] as Workload;
  }

  /** The Deployment and the Service that answer on the SMTP port: Mailpit. */
  mailpit(): { deployment?: Workload; service?: Manifest } {
    const service = this.of('Service').find((candidate) =>
      candidate.spec?.ports?.some((port) => port.port === 1025),
    );
    const deployment = this.of('Deployment').find((candidate) =>
      candidate.spec?.template?.spec.containers.some((container) =>
        container.ports?.some((port) => port.containerPort === 1025),
      ),
    );
    return { deployment: deployment as Workload | undefined, service };
  }

  /** The Service whose selector picks the pods of a template. */
  serviceOf(template: PodTemplate): Manifest {
    const found = this.of('Service').filter((service) => {
      const selector = Object.entries(service.spec?.selector ?? {});
      return (
        selector.length > 0 &&
        selector.every(([key, value]) => template.metadata?.labels?.[key] === value)
      );
    });
    expect(found, 'one Service selects the pods').toHaveLength(1);
    return found[0];
  }

  /** The environment a container starts with: its ConfigMaps and Secrets in order, then its own. */
  environmentOf(container: Container): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const source of container.envFrom ?? []) {
      if (source.configMapRef !== undefined) {
        Object.assign(environment, this.named('ConfigMap', source.configMapRef.name).data);
      }
      if (source.secretRef !== undefined) {
        Object.assign(environment, decoded(this.named('Secret', source.secretRef.name)));
      }
    }
    for (const variable of container.env ?? []) {
      environment[variable.name] = variable.value ?? '';
    }
    return environment;
  }
}

function decoded(secret: Manifest): Record<string, string> {
  return Object.fromEntries(
    Object.entries(secret.data ?? {}).map(([key, value]) => [
      key,
      Buffer.from(value, 'base64').toString('utf8'),
    ]),
  );
}

function parseManifests(text: string): Manifest[] {
  return parseAllDocuments(text).flatMap((document) => {
    expect(
      document.errors.map((error) => error.message),
      'the render is valid YAML',
    ).toEqual([]);
    const value = document.toJSON() as Manifest | null;
    return value === null ? [] : [value];
  });
}

const renders = new Map<string, Promise<Rendered>>();

/** Renders the chart the way the deploy does, once for each combination of values. */
function render(valuesFile: string, settings: Record<string, string>): Promise<Rendered> {
  const key = JSON.stringify([valuesFile, settings]);
  let rendered = renders.get(key);
  if (rendered === undefined) {
    rendered = helm('template', valuesFile, settings).then((result) => {
      expect(result.code, `helm template ${valuesFile}: ${result.stderr}`).toBe(0);
      return new Rendered(result.stdout, parseManifests(result.stdout));
    });
    renders.set(key, rendered);
  }
  return rendered;
}

const prod = () => render('values-prod.yaml', { ...PROD_DEPLOY, ...SECRETS });
const local = (settings: Record<string, string> = LOCAL_DEPLOY) =>
  render('values-local.yaml', settings);

/** The container port a probe or a Service names, by number or by the name of a container port. */
function portNumber(container: Container, port: string | number | undefined): number | undefined {
  if (typeof port === 'number') {
    return port;
  }
  return container.ports?.find((candidate) => candidate.name === port)?.containerPort;
}

function cpuMillicores(quantity: string | number | undefined): number {
  const text = String(quantity);
  return text.endsWith('m') ? Number(text.slice(0, -1)) : Number(text) * 1000;
}

function memoryBytes(quantity: string | undefined): number {
  const match = /^(\d+)(Ki|Mi|Gi)?$/.exec(quantity ?? '');
  expect(match, `${quantity} is a memory quantity`).not.toBeNull();
  const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3 };
  return Number(match?.[1]) * (units[match?.[2] as keyof typeof units] ?? 1);
}

describe('Chart with the prod values', () => {
  it('runs the Deployment with both probes, its requests and limits, as non-root', async () => {
    const pod = (await prod()).application(PROD_IMAGE).spec.template;
    const container = pod.spec.containers[0];

    expect(container.livenessProbe?.httpGet?.path).toBe('/health/live');
    expect(portNumber(container, container.livenessProbe?.httpGet?.port)).toBe(3000);
    expect(container.readinessProbe?.httpGet?.path).toBe('/health/ready');
    expect(portNumber(container, container.readinessProbe?.httpGet?.port)).toBe(3000);

    expect(cpuMillicores(container.resources?.requests?.cpu)).toBe(250);
    expect(memoryBytes(container.resources?.requests?.memory)).toBe(256 * 1024 ** 2);
    expect(cpuMillicores(container.resources?.limits?.cpu)).toBe(1000);
    expect(memoryBytes(container.resources?.limits?.memory)).toBe(512 * 1024 ** 2);

    const nonRoot =
      container.securityContext?.runAsNonRoot ?? pod.spec.securityContext?.runAsNonRoot;
    const user = container.securityContext?.runAsUser ?? pod.spec.securityContext?.runAsUser;
    expect(nonRoot).toBe(true);
    // The image's user has a name, so the kubelet can tell it is not root only from a number.
    expect(user).toBeGreaterThan(0);
  });

  it('gives the readiness probe longer than a readiness check takes to give up', async () => {
    const container = (await prod()).application(PROD_IMAGE).spec.template.spec.containers[0];

    // GET /health/ready answers after 2 seconds when the database or Redis hangs.
    expect(container.readinessProbe?.timeoutSeconds).toBeGreaterThanOrEqual(3);
  });

  it("exposes port 80 to 3000 through a Network Load Balancer that keeps the client's address", async () => {
    const chart = await prod();
    const pod = chart.application(PROD_IMAGE).spec.template;
    const service = chart.serviceOf(pod);

    expect(service.spec?.type).toBe('LoadBalancer');
    expect(service.spec?.ports).toHaveLength(1);
    expect(service.spec?.ports?.[0].port).toBe(80);
    expect(portNumber(pod.spec.containers[0], service.spec?.ports?.[0].targetPort)).toBe(3000);
    expect(service.spec?.externalTrafficPolicy).toBe('Local');
    expect(
      service.metadata.annotations?.['service.beta.kubernetes.io/aws-load-balancer-type'],
    ).toBe('nlb');
  });

  it('splits the settings between the ConfigMap and the Secret', async () => {
    const chart = await prod();
    const container = chart.application(PROD_IMAGE).spec.template.spec.containers[0];
    const configMap = chart.named(
      'ConfigMap',
      container.envFrom?.find((source) => source.configMapRef)?.configMapRef?.name as string,
    );
    const secret = decoded(
      chart.named(
        'Secret',
        container.envFrom?.find((source) => source.secretRef)?.secretRef?.name as string,
      ),
    );
    const { service: mailpit } = chart.mailpit();

    expect(mailpit, 'a Service answers SMTP').toBeDefined();
    expect(configMap.data).toMatchObject({
      DATABASE_SSL: 'true',
      DATABASE_SSL_CA: RDS_BUNDLE,
      REDIS_TLS: 'true',
      SMTP_HOST: mailpit?.metadata.name,
      DATABASE_HOST: PROD_DEPLOY['config.DATABASE_HOST'],
      DATABASE_PORT: '5432',
      DATABASE_NAME: 'workshop',
      DATABASE_USER: 'workshop',
      REDIS_HOST: PROD_DEPLOY['config.REDIS_HOST'],
      REDIS_PORT: '6379',
      APP_PUBLIC_URL: PROD_DEPLOY['config.APP_PUBLIC_URL'],
    });
    expect(secret).toEqual({
      DATABASE_PASSWORD: SECRETS['secrets.DATABASE_PASSWORD'],
      JWT_SECRET: SECRETS['secrets.JWT_SECRET'],
    });
    expect(
      Object.keys(configMap.data ?? {}).filter((key) => key in secret),
      'no key is in both',
    ).toEqual([]);
    for (const value of Object.values(secret)) {
      expect(JSON.stringify(configMap.data), 'the ConfigMap holds no secret').not.toContain(value);
    }
  });

  it('gives the pods settings the application accepts', async () => {
    const chart = await prod();
    const container = chart.application(PROD_IMAGE).spec.template.spec.containers[0];

    const settings = validateEnv(chart.environmentOf(container));

    expect(settings).toMatchObject({
      DATABASE_HOST: PROD_DEPLOY['config.DATABASE_HOST'],
      DATABASE_SSL: 'true',
      DATABASE_SSL_CA: RDS_BUNDLE,
      REDIS_TLS: 'true',
      SMTP_PORT: 1025,
      APP_PUBLIC_URL: PROD_DEPLOY['config.APP_PUBLIC_URL'],
    });
  });

  it('runs Mailpit beside the application', async () => {
    const chart = await prod();
    const application = chart.application(PROD_IMAGE);
    const { deployment, service } = chart.mailpit();

    expect(deployment, 'a Deployment runs Mailpit').toBeDefined();
    expect(service, 'a Service answers SMTP').toBeDefined();
    expect(deployment).not.toBe(application);
    const mailpit = deployment?.spec.template.spec.containers[0] as Container;
    expect(mailpit.ports?.map((port) => port.containerPort).sort()).toEqual([1025, 8025]);
    expect(chart.serviceOf(deployment?.spec.template as PodTemplate)).toBe(service);
    expect(chart.serviceOf(application.spec.template), 'the API has a Service of its own').not.toBe(
      service,
    );
    expect(
      service?.spec?.ports?.map((port) => [port.port, portNumber(mailpit, port.targetPort)]),
    ).toEqual([
      [1025, 1025],
      [8025, 8025],
    ]);
    expect(chart.environmentOf(application.spec.template.spec.containers[0])).toMatchObject({
      SMTP_HOST: service?.metadata.name,
      SMTP_PORT: '1025',
    });
  });

  it('scales the Deployment from 2 to 6 replicas on CPU at 70% and memory at 80%', async () => {
    const chart = await prod();
    const [autoscaler, ...others] = chart.of('HorizontalPodAutoscaler');

    expect(others).toEqual([]);
    expect(autoscaler.apiVersion).toBe('autoscaling/v2');
    expect(autoscaler.spec?.scaleTargetRef).toEqual({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      name: chart.application(PROD_IMAGE).metadata.name,
    });
    expect([autoscaler.spec?.minReplicas, autoscaler.spec?.maxReplicas]).toEqual([2, 6]);
    expect(
      autoscaler.spec?.metrics?.map((metric) => [
        metric.type,
        metric.resource?.name,
        metric.resource?.target.type,
        metric.resource?.target.averageUtilization,
      ]),
    ).toEqual([
      ['Resource', 'cpu', 'Utilization', 70],
      ['Resource', 'memory', 'Utilization', 80],
    ]);
  });

  it('runs the migrations with node in a pre-install and pre-upgrade hook', async () => {
    const chart = await prod();
    const [job] = chart.of('Job');
    const container = (job.spec?.template as PodTemplate).spec.containers[0];
    const weight = (object: Manifest) =>
      Number(object.metadata.annotations?.['helm.sh/hook-weight'] ?? 0);

    expect(job.metadata.annotations?.['helm.sh/hook']).toBe(HOOKS);
    expect([...(container.command ?? []), ...(container.args ?? [])]).toEqual([
      'node',
      'dist/migrate.js',
    ]);
    expect(container.image).toBe(PROD_IMAGE);

    // Helm runs a hook before it creates the other objects of the release, so what the Job reads
    // is a hook too, and a lighter one.
    expect(container.envFrom?.length).toBeGreaterThan(0);
    for (const source of container.envFrom ?? []) {
      const settings = source.configMapRef
        ? chart.named('ConfigMap', source.configMapRef.name)
        : chart.named('Secret', source.secretRef?.name as string);
      expect(settings.metadata.annotations?.['helm.sh/hook'], `${settings.kind} is a hook`).toBe(
        HOOKS,
      );
      expect(weight(settings), `${settings.kind} comes before the Job`).toBeLessThan(weight(job));
    }

    // The migration reaches RDS the way the application does.
    expect(chart.environmentOf(container)).toMatchObject({
      DATABASE_HOST: PROD_DEPLOY['config.DATABASE_HOST'],
      DATABASE_PORT: '5432',
      DATABASE_NAME: 'workshop',
      DATABASE_USER: 'workshop',
      DATABASE_PASSWORD: SECRETS['secrets.DATABASE_PASSWORD'],
      DATABASE_SSL: 'true',
      DATABASE_SSL_CA: RDS_BUNDLE,
    });
  });
});

describe('Chart with the local values', () => {
  it('gives the pods settings the application accepts', async () => {
    const chart = await local();
    const container = chart.application(LOCAL_IMAGE).spec.template.spec.containers[0];

    const settings = validateEnv(chart.environmentOf(container));

    expect(settings).toMatchObject({
      DATABASE_HOST: 'postgres',
      REDIS_HOST: 'redis',
      SMTP_HOST: 'mailpit',
      SMTP_PORT: 1025,
      APP_PUBLIC_URL: 'http://localhost:18080',
    });
    expect(settings.DATABASE_SSL).not.toBe('true');
    expect(settings.REDIS_TLS).not.toBe('true');
  });

  it('leaves Mailpit to the compose stack', async () => {
    const chart = await local();
    const container = chart.application(LOCAL_IMAGE).spec.template.spec.containers[0];
    const ports = chart
      .of('Service')
      .flatMap((service) => service.spec?.ports?.map((port) => port.port) ?? []);
    const images = chart
      .of('Deployment')
      .flatMap(
        (deployment) => deployment.spec?.template?.spec.containers.map((c) => c.image) ?? [],
      );

    expect(chart.of('Deployment')).toHaveLength(1);
    expect(chart.mailpit()).toEqual({ deployment: undefined, service: undefined });
    expect(ports).not.toContain(1025);
    expect(ports).not.toContain(8025);
    expect(
      [...chart.objects.map((object) => object.metadata.name), ...images].join(' '),
    ).not.toMatch(/mailpit/i);
    expect(chart.environmentOf(container)).toMatchObject({
      SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025',
    });
  });
});

describe('Chart', () => {
  it('renders no Job but the migration hook with either values file', async () => {
    for (const chart of [await prod(), await local()]) {
      const jobs = chart.of('Job');

      expect(jobs).toHaveLength(1);
      expect(jobs[0].metadata.annotations?.['helm.sh/hook']).toBe(HOOKS);
      expect(jobs[0].spec?.template?.spec.containers[0].command).toEqual([
        'node',
        'dist/migrate.js',
      ]);
      expect(chart.of('CronJob')).toEqual([]);
      expect(chart.text, 'nothing in the render runs a seed').not.toMatch(/seed/i);
    }
  });

  it('renders manifests kubeconform accepts with the prod and the local values', async () => {
    const directory = mkdtempSync(join(REPOSITORY_ROOT, '.tools', 'chart-spec-'));
    cleanup.add(() => Promise.resolve(rmSync(directory, { recursive: true, force: true })));
    const schemas = join(REPOSITORY_ROOT, '.tools', 'kubeconform');
    mkdirSync(schemas, { recursive: true });

    for (const [name, chart] of [
      ['prod', await prod()],
      ['local', await local()],
    ] as const) {
      const file = join(directory, `${name}.yaml`);
      writeFileSync(file, chart.text);
      const result = await tool([
        ...['kubeconform', '-strict', '-summary', '-cache', schemas],
        ...['-kubernetes-version', `${kubernetesMinor()}.0`, file],
      ]);
      const summary = /Valid: (\d+), Invalid: (\d+), Errors: (\d+), Skipped: (\d+)/.exec(
        result.stdout,
      );

      expect(result.code, `${name}: ${result.stdout}${result.stderr}`).toBe(0);
      // Every object is valid, and none was skipped for want of a schema.
      expect(summary?.slice(1).map(Number), `${name} summary`).toEqual([
        chart.objects.length,
        0,
        0,
        0,
      ]);
    }
  });

  it('passes helm lint with the prod and the local values', async () => {
    for (const [file, settings] of [
      ['values-prod.yaml', { ...PROD_DEPLOY, ...SECRETS }],
      ['values-local.yaml', LOCAL_DEPLOY],
    ] as const) {
      const result = await helm('lint', file, settings);

      expect(result.code, `${file}: ${result.stdout}${result.stderr}`).toBe(0);
      expect(result.stdout).toContain('1 chart(s) linted, 0 chart(s) failed');
    }
  });

  it('keeps every secret out of the values files and fails without the ones the deploy passes', async () => {
    const secretName = /pass(word)?|secret|token|key|credential/i;
    const secretShapes = [
      /-----BEGIN/,
      /AKIA[0-9A-Z]{16}/,
      /eyJ[\w-]{8,}\.[\w-]{8,}/,
      /^[A-Za-z0-9+/_=-]{32,}$/,
    ];
    const offenders: string[] = [];
    const walk = (node: unknown, path: string[]): void => {
      if (node !== null && typeof node === 'object') {
        for (const [key, child] of Object.entries(node)) {
          walk(child, [...path, key]);
        }
      } else if (typeof node === 'string' && node !== '') {
        if (
          path.some((key) => secretName.test(key)) ||
          secretShapes.some((shape) => shape.test(node))
        ) {
          offenders.push(path.join('.'));
        }
      }
    };
    for (const file of ['values.yaml', 'values-prod.yaml', 'values-local.yaml']) {
      walk(parse(readText(join(CHART, file))), [file]);
    }
    expect(offenders, 'a values file holds a password, a key or a token').toEqual([]);

    // A render without the secrets stops, in prod and in the local cluster, and names them.
    for (const [file, settings] of [
      ['values-prod.yaml', PROD_DEPLOY],
      ['values-local.yaml', { 'image.tag': LOCAL_DEPLOY['image.tag'] }],
    ] as const) {
      const result = await helm('template', file, settings);

      expect(result.code, `${file} renders without the secrets`).not.toBe(0);
      expect(result.stderr, file).toContain('DATABASE_PASSWORD');
      expect(result.stderr, file).toContain('JWT_SECRET');
    }
    // Each one is needed on its own.
    for (const [given, missing] of [
      ['secrets.DATABASE_PASSWORD', 'JWT_SECRET'],
      ['secrets.JWT_SECRET', 'DATABASE_PASSWORD'],
    ] as const) {
      const result = await helm('template', 'values-prod.yaml', {
        ...PROD_DEPLOY,
        [given]: SECRETS[given],
      });

      expect(result.code, `${missing} alone is missing`).not.toBe(0);
      expect(result.stderr).toContain(missing);
    }
  });

  it('names every value the deploy passes when none is given', async () => {
    const result = await helm('template', 'values-prod.yaml', {});
    const required = Object.keys({ ...PROD_DEPLOY, ...SECRETS }).filter(
      (key) => !key.endsWith('_PORT'),
    );

    expect(result.code).not.toBe(0);
    for (const key of required) {
      expect(result.stderr, key).toContain(key);
    }
  });

  it('leaves the replica count to the autoscaler', async () => {
    expect((await prod()).application(PROD_IMAGE).spec.replicas).toBeUndefined();
    expect((await local()).application(LOCAL_IMAGE).spec.replicas).toBeUndefined();
  });

  it('rolls the pods when a setting or a secret changes', async () => {
    const podOf = async (settings: Record<string, string>) =>
      (await local(settings)).application(LOCAL_IMAGE).spec.template;
    const base = await podOf(LOCAL_DEPLOY);

    expect(await podOf({ ...LOCAL_DEPLOY })).toEqual(base);
    expect(await podOf({ ...LOCAL_DEPLOY, 'config.RATE_LIMIT_MAX_REQUESTS': '5000' })).not.toEqual(
      base,
    );
    expect(await podOf({ ...LOCAL_DEPLOY, 'secrets.JWT_SECRET': 'a'.repeat(40) })).not.toEqual(
      base,
    );
  });

  it('gives the migration the database settings and nothing else', async () => {
    for (const chart of [await prod(), await local()]) {
      const [job] = chart.of('Job');
      const environment = chart.environmentOf(
        (job.spec?.template as PodTemplate).spec.containers[0],
      );

      expect(Object.keys(environment)).toEqual(
        expect.arrayContaining(['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_PASSWORD']),
      );
      expect(
        Object.keys(environment).filter((key) => !key.startsWith('DATABASE_')),
        'the migration reads no other setting',
      ).toEqual([]);
    }
  });

  it('pins the local cluster to the Kubernetes version of prod', () => {
    const cluster = parse(readText(KIND_CONFIG)) as { nodes: Array<{ image: string }> };
    const minor = kubernetesMinor().replace('.', '\\.');

    expect(cluster.nodes).toHaveLength(1);
    expect(cluster.nodes[0].image).toMatch(
      new RegExp(`^kindest/node:v${minor}\\.\\d+(@sha256:[0-9a-f]{64})?$`),
    );
  });

  it('publishes the local Service on localhost:18080', async () => {
    const cluster = parse(readText(KIND_CONFIG)) as {
      nodes: Array<{ extraPortMappings: Array<{ containerPort: number; hostPort: number }> }>;
    };
    const chart = await local();
    const service = chart.serviceOf(chart.application(LOCAL_IMAGE).spec.template);

    expect(service.spec?.type).toBe('NodePort');
    expect(cluster.nodes[0].extraPortMappings).toContainEqual(
      expect.objectContaining({
        containerPort: service.spec?.ports?.[0].nodePort,
        hostPort: 18080,
      }),
    );
  });
});
