import { Contract, FetchRequest, JsonRpcProvider, ZeroHash, id as hashId } from 'ethers';
import type { AppConfig } from '../config.js';
import { ApiError, invariant } from '../errors.js';

export interface ChainRoles { admin: boolean; issuer: boolean }
export interface ChainCertificate {
  fileHash: string; issuer: string; student: string; issuedAt: string | null; revokedAt: string | null;
  revokeReasonCode: number; exists: boolean; revoked: boolean;
}
export interface IssuanceExpectation { certificateId: string; fileHash: string; issuer: string; student: string }
export const unixToIso = (seconds: bigint | number): string | null => Number(seconds) === 0 ? null : new Date(Number(seconds) * 1000).toISOString();

export class ChainService {
  readonly provider: JsonRpcProvider;
  readonly contract: Contract;
  constructor(readonly config: AppConfig) {
    const request = new FetchRequest(config.rpcUrl);
    request.timeout = 5000;
    this.provider = new JsonRpcProvider(request, { chainId: config.chainId, name: 'educert' }, { staticNetwork: true, batchMaxCount: 1, cacheTimeout: -1 });
    this.contract = new Contract(config.contractAddress, config.abi, this.provider);
  }

  async rpc<T>(work: () => Promise<T>): Promise<T> {
    try {
      const chainId = Number(BigInt(await this.provider.send('eth_chainId', [])));
      invariant(chainId === this.config.chainId, 503, 'RPC_ERROR', 'RPC network does not match contract configuration');
      invariant(await this.provider.getCode(this.config.contractAddress) !== '0x', 503, 'RPC_ERROR', 'Configured contract is not deployed on this node');
      return await work();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(503, 'RPC_ERROR', 'Unable to read the configured blockchain');
    }
  }

  async roles(wallet: string): Promise<ChainRoles> {
    return this.rpc(async () => {
      const [admin, issuer] = await Promise.all([
        this.contract.getFunction('hasRole')(ZeroHash, wallet),
        this.contract.getFunction('hasRole')(hashId('ISSUER_ROLE'), wallet),
      ]);
      return { admin: Boolean(admin), issuer: Boolean(issuer) };
    });
  }

  async certificate(certificateId: string): Promise<ChainCertificate> {
    return this.rpc(async () => this.mapCertificate(await this.contract.getFunction('getCertificate')(certificateId)));
  }

  /** Read a certificate pinned to one block so a report can cite exactly what it saw. */
  async certificateSnapshot(certificateId: string): Promise<ChainCertificate & { blockNumber: number }> {
    return this.rpc(async () => {
      const blockNumber = await this.provider.getBlockNumber();
      const raw = await this.contract.getFunction('getCertificate')(certificateId, { blockTag: blockNumber });
      return { ...this.mapCertificate(raw), blockNumber };
    });
  }

  async issuance(txHash: string, expected: IssuanceExpectation): Promise<ChainCertificate | null> {
    return this.rpc(async () => {
      const [tx, receipt] = await Promise.all([this.provider.getTransaction(txHash), this.provider.getTransactionReceipt(txHash)]);
      invariant(tx, 400, 'TX_NOT_FOUND', 'Transaction is not known to the configured node');
      invariant(Number(tx.chainId) === this.config.chainId && tx.to === this.config.contractAddress && tx.from === expected.issuer, 409, 'TX_MISMATCH', 'Transaction network, target or sender does not match the draft');
      if (!receipt) return null;
      invariant(receipt.status === 1, 409, 'TX_FAILED', 'Transaction execution failed');
      const issued = receipt.logs.filter(log => log.address === this.config.contractAddress).map(log => {
        try { return this.contract.interface.parseLog({ topics: [...log.topics], data: log.data }); }
        catch { return null; }
      }).find(log => log?.name === 'CertificateIssued' && log.args.certificateId.toLowerCase() === expected.certificateId &&
        log.args.fileHash.toLowerCase() === expected.fileHash && log.args.issuer === expected.issuer && log.args.student === expected.student);
      invariant(issued, 409, 'EVENT_MISMATCH', 'Receipt does not contain CertificateIssued matching this draft');
      const cert = this.mapCertificate(await this.contract.getFunction('getCertificate')(expected.certificateId));
      invariant(cert.exists && cert.fileHash === expected.fileHash && cert.issuer === expected.issuer && cert.student === expected.student, 409, 'CHAIN_STATE_MISMATCH', 'Contract state does not match this draft');
      return cert;
    });
  }

  async stats() {
    return this.rpc(async () => {
      const result = await this.contract.getFunction('getStats')();
      return { issued: Number(result[0]), revoked: Number(result[1]), active: Number(result[2]) };
    });
  }

  async events(options: { fromBlock?: number; toBlock?: number; offset: number; limit: number; type: 'ALL' | 'ISSUED' | 'REVOKED' }) {
    return this.rpc(async () => {
      const latest = await this.provider.getBlockNumber();
      const toBlock = options.toBlock ?? latest;
      const fromBlock = options.fromBlock ?? Math.max(0, toBlock - 4999);
      invariant(fromBlock <= toBlock && toBlock <= latest && toBlock - fromBlock < 5000, 400, 'INVALID_BLOCK_RANGE', 'Use an ordered window of at most 5000 mined blocks');
      const issueTopic = this.contract.interface.getEvent('CertificateIssued')!.topicHash;
      const revokeTopic = this.contract.interface.getEvent('CertificateRevoked')!.topicHash;
      const topics = options.type === 'ISSUED' ? [issueTopic] : options.type === 'REVOKED' ? [revokeTopic] : [issueTopic, revokeTopic];
      const logs = await this.provider.getLogs({ address: this.config.contractAddress, fromBlock, toBlock, topics: [topics] });
      const records = logs.sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index).map(log => {
        const event = this.contract.interface.parseLog({ topics: [...log.topics], data: log.data })!;
        const common = { type: event.name === 'CertificateIssued' ? 'ISSUED' : 'REVOKED', certificateId: event.args.certificateId.toLowerCase(), txHash: log.transactionHash,
          blockNumber: log.blockNumber, blockHash: log.blockHash, logIndex: log.index };
        return event.name === 'CertificateIssued'
          ? { ...common, issuer: event.args.issuer, student: event.args.student, fileHash: event.args.fileHash.toLowerCase(), issuedAt: unixToIso(event.args.issuedAt) }
          : { ...common, revokedBy: event.args.revokedBy, revokeReasonCode: Number(event.args.reasonCode), revokedAt: unixToIso(event.args.revokedAt) };
      });
      return { items: records.slice(options.offset, options.offset + options.limit), total: records.length, offset: options.offset, limit: options.limit, fromBlock, toBlock,
        previousToBlock: fromBlock > 0 ? fromBlock - 1 : null, nextFromBlock: toBlock < latest ? toBlock + 1 : null };
    });
  }

  private mapCertificate(raw: any): ChainCertificate {
    return {
      fileHash: raw.fileHash.toLowerCase(), issuer: raw.issuer, student: raw.student,
      issuedAt: unixToIso(raw.issuedAt), revokedAt: unixToIso(raw.revokedAt),
      revokeReasonCode: Number(raw.revokeReasonCode), exists: Boolean(raw.exists), revoked: Boolean(raw.revoked),
    };
  }

  close() { this.provider.destroy(); }
}
