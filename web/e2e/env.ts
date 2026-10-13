// anvil's first default account; a public test key, not a secret.
export const RECORDER_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const RECORDER_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// The first contract that account deploys on a fresh anvil always lands here.
export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

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
