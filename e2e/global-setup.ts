import { startStack, stopStack } from './stack.js';

export default async function globalSetup() {
  const state = await startStack().catch(async error => { await stopStack(); throw error; });
  console.log(`EduCert E2E stack ready: contract ${state.contractAddress}`);
  return async () => { await stopStack(state); };
}
