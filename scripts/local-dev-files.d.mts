import type { AppIdentity } from "./deployment-app-identity.mjs";
export function createLocalDevFiles(root: string, identity: AppIdentity, salt: string): {
  staticDirectory: string;
  environmentFile: string;
  cleanup(): void;
};
