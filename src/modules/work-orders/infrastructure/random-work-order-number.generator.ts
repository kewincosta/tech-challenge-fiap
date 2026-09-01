import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { WorkOrderNumberGenerator } from '../application/ports/work-order-number-generator.port';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const BLOCK_LENGTH = 6;

/** A port, not a free function, so a test can make a collision happen on demand (design.md). */
@Injectable()
export class RandomWorkOrderNumberGenerator implements WorkOrderNumberGenerator {
  next(year: number): string {
    let block = '';
    for (let index = 0; index < BLOCK_LENGTH; index += 1) {
      block += ALPHABET[randomInt(ALPHABET.length)];
    }
    return `${block}-${year}`;
  }
}
