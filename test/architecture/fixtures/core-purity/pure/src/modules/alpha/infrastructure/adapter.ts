import { Injectable } from '@nestjs/common';

export const ADAPTER = Symbol('Adapter');

@Injectable()
export class Adapter {}
