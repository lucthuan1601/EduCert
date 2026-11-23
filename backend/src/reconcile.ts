import { loadConfig } from './config.js';
import { openDatabase, type CertificateRow } from './database.js';
import { ChainService } from './services/chain.js';
import { PrivateStorage } from './services/storage.js';
import { finalizeCertificate } from './services/finalize.js';
import { ApiError } from './errors.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const chain = new ChainService(config);
const storage = new PrivateStorage(config.storageDir);
try {
  const pending = db.prepare("SELECT * FROM CertificateFile WHERE sync_state = 'PENDING_CHAIN' AND tx_hash IS NOT NULL AND chain_id = ? AND contract_address = ? ORDER BY created_at LIMIT 100").all(config.chainId, config.contractAddress) as CertificateRow[];
  for (const row of pending) {
    try {
      const result = await finalizeCertificate(config, db, chain, storage, row.certificate_id, row.issuer_wallet, row.tx_hash!);
      console.log(`${row.certificate_id}: ${result.data.syncState}`);
    } catch (error) {
      console.error(`${row.certificate_id}: ${error instanceof ApiError ? error.code : 'INTERNAL_ERROR'}`);
      process.exitCode = 1;
    }
  }
  console.log(`Reconciled ${pending.length} pending certificate(s); no transaction was signed.`);
} finally { chain.close(); db.close(); }
