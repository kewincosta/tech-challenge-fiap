import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPOSITORY_ROOT } from '../support/docker';
import { readText } from '../support/hcl';
import {
  actionSteps,
  needsOf,
  permissionsOf,
  readWorkflow,
  scriptSteps,
  triggersOf,
  workflowFiles,
  workflowText,
} from '../support/workflows';

const NO_FAILURE = [undefined, false, 'false'];

const ci = readWorkflow('ci.yml');

describe('Workflows', () => {
  it('pins each action to a full commit SHA and names its release in a comment', () => {
    for (const file of workflowFiles()) {
      const used = workflowText(file)
        .split('\n')
        .filter((line) => /^\s*(?:-\s+)?uses:/.test(line));

      expect(used.length, `${file} uses an action`).toBeGreaterThan(0);
      for (const line of used) {
        expect(line, `${file}: ${line.trim()}`).toMatch(
          /uses:\s+[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/,
        );
      }
    }
  });

  it('keeps the checkout token out of the working folder', () => {
    for (const file of workflowFiles()) {
      const checkouts = Object.values(readWorkflow(file).jobs).flatMap((job) =>
        actionSteps(job).filter((step) => step.uses.startsWith('actions/checkout@')),
      );

      expect(checkouts.length, file).toBeGreaterThan(0);
      for (const step of checkouts) {
        expect(step.with?.['persist-credentials'], file).toBe(false);
      }
    }
  });

  it('stops a script at its first error and gives every job a timeout', () => {
    for (const file of workflowFiles()) {
      const workflow = readWorkflow(file);

      expect(workflow.defaults?.run?.shell, `${file} shell`).toBe('bash');
      for (const [id, job] of Object.entries(workflow.jobs)) {
        expect(job['timeout-minutes'], `${file} ${id}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the AWS account id out of the workflows', () => {
    for (const file of workflowFiles()) {
      expect(workflowText(file), file).not.toMatch(/(?<![\w-])\d{12}(?![\w-])/);
    }
  });
});

describe('CI workflow', () => {
  it('runs lint, unit and build as parallel jobs on every push and pull request', () => {
    const triggers = triggersOf(ci);
    const commands: Record<string, string> = {
      lint: 'npm run lint',
      unit: 'npm run test:unit',
      build: 'npm run build',
    };

    expect(Object.keys(triggers).sort()).toEqual(['pull_request', 'push']);
    for (const [name, filters] of Object.entries(triggers)) {
      expect(Object.keys(filters), `${name} has no branch, path, tag or type filter`).toEqual([]);
    }
    expect(Object.keys(ci.jobs).sort()).toEqual(['build', 'lint', 'unit']);
    for (const [id, command] of Object.entries(commands)) {
      const job = ci.jobs[id];
      const step = scriptSteps(job).find((candidate) => candidate.run.trim() === command);

      expect(needsOf(job), `${id} waits for no job`).toEqual([]);
      expect(job.if, `${id} always runs`).toBeUndefined();
      expect(NO_FAILURE, `${id} may not fail quietly`).toContain(job['continue-on-error']);
      expect(step, `${id} runs ${command}`).toBeDefined();
      expect(step?.if, `${id} runs ${command} every time`).toBeUndefined();
      expect(NO_FAILURE, `${command} may not fail quietly`).toContain(step?.['continue-on-error']);
    }
  });

  it('installs from the lock file before it runs a command', () => {
    for (const [id, job] of Object.entries(ci.jobs)) {
      const runs = scriptSteps(job).map((step) => step.run.trim());

      expect(runs[0], `${id} installs first`).toBe('npm ci');
      expect(runs.length, `${id} runs a command after the install`).toBeGreaterThan(1);
    }
  });

  it('asks for read access to the repository and nothing else', () => {
    expect(ci.permissions).toEqual({ contents: 'read' });
    for (const [id, job] of Object.entries(ci.jobs)) {
      expect(permissionsOf(ci, job), id).toEqual({ contents: 'read' });
    }
    expect(workflowText('ci.yml')).not.toMatch(/aws|id-token|secrets\./i);
  });

  it('runs the Node major version that the production image runs', () => {
    const image = /^FROM node:(\d+)-/m.exec(readText(join(REPOSITORY_ROOT, 'Dockerfile')));

    expect(image, 'the Dockerfile names a node image').not.toBeNull();
    for (const [id, job] of Object.entries(ci.jobs)) {
      const setup = actionSteps(job).find((step) => step.uses.startsWith('actions/setup-node@'));

      expect(String(setup?.with?.['node-version']), id).toBe(image?.[1]);
    }
  });
});
