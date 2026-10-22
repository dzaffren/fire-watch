// anvil's first default account; a public test key, not a secret.
export const RECORDER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const RECORDER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// The first contract that account deploys on a fresh anvil always lands here.
export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
// FireRuns, the second contract that account deploys.
export const FIRE_RUNS_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
// anvil's second and third default accounts: FireRuns' owner, and the recorder key it puts in
// after runs 1 and 2. Public test keys, not secrets.
export const OWNER_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
export const OWNER_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
export const NEW_RECORDER_ADDRESS = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
export const NEW_RECORDER_PRIVATE_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

export const ANVIL_PORT = 8546;
export const FIRMS_PORT = 8799;
export const API_PORT = 8001;
export const WEB_PORT = 4173;

export const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
export const FIRMS_URL = `http://127.0.0.1:${FIRMS_PORT}`;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

export const ADMIN_DATABASE_URL = "postgresql://firewatch:firewatch@127.0.0.1:55432/firewatch";
export const E2E_DATABASE = "firewatch_e2e";
export const E2E_DATABASE_URL = `postgresql://firewatch:firewatch@127.0.0.1:55432/${E2E_DATABASE}`;
