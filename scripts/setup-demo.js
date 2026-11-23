import hre from 'hardhat';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../config/contract-config.json', import.meta.url), 'utf8'));
const { ethers } = hre;
const chainId = Number((await ethers.provider.getNetwork()).chainId);
if (chainId !== 31337 || config.chainId !== chainId) throw new Error('Demo setup only supports the configured Hardhat local network');
if (await ethers.provider.getCode(config.contractAddress) === '0x') throw new Error('Deploy and export the actual contract address before setup-demo');
const [admin, issuer, student] = await ethers.getSigners();
const registry = new ethers.Contract(config.contractAddress, config.abi, admin);
const issuerRole = await registry.ISSUER_ROLE();
if (!await registry.hasRole(issuerRole, issuer.address)) await (await registry.grantRole(issuerRole, issuer.address)).wait();
console.log(JSON.stringify({ chainId, contractAddress: config.contractAddress, admin: admin.address, issuer: issuer.address, student: student.address }, null, 2));
