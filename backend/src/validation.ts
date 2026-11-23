import { getAddress, isAddress, ZeroAddress } from 'ethers';
import { z } from 'zod';

export const walletSchema = z.string().refine(value => isAddress(value) && value.toLowerCase() !== ZeroAddress, 'Invalid wallet address').transform(value => getAddress(value));
export const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'Expected 0x followed by 64 hexadecimal characters').transform(value => value.toLowerCase()).refine(value => value !== `0x${'0'.repeat(64)}`, 'Zero value is not allowed');
export const labelSchema = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\x00-\x1f\x7f]/.test(value), 'Control characters are not allowed');
export const paginationSchema = z.object({
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
