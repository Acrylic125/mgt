import { hostname } from "node:os";
import Dockerode from "dockerode";
import { env } from "./env.js";

const docker = new Dockerode({ socketPath: "/var/run/docker.sock" });

async function resolveNetworkMode() {
  if (env.DOCKER_NETWORK !== undefined) {
    return env.DOCKER_NETWORK;
  }

  try {
    const info = await docker.getContainer(hostname()).inspect();
    const networks = info.NetworkSettings.Networks;
    const names = Object.keys(networks);
    const first = names[0];
    if (first === undefined) {
      return undefined;
    }
    return first;
  } catch {
    // Not running in Docker (or hostname is not a container id/name).
    return undefined;
  }
}

export async function spawnAuditRunner(runnerId: string, repo: string) {
  const networkMode = await resolveNetworkMode();

  const createOptions: Dockerode.ContainerCreateOptions = {
    Image: env.AUDIT_RUNNER_IMAGE,
    name: `audit-${runnerId}`,
    Env: [
      `RUNNER_ID=${runnerId}`,
      `REPO=${repo}`,
      `N8N_RUNNER_SERVICE_URL=${env.N8N_RUNNER_SERVICE_URL}`,
      `GITHUB_TOKEN=${env.GITHUB_TOKEN}`,
    ],
    HostConfig: {
      AutoRemove: true,
    },
  };

  if (networkMode !== undefined && createOptions.HostConfig) {
    createOptions.HostConfig.NetworkMode = networkMode;
  }

  const container = await docker.createContainer(createOptions);
  await container.start();
}
