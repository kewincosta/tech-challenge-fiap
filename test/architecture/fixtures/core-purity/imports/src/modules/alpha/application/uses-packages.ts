import { hash } from 'argon2';
import { plainToInstance } from 'class-transformer';
import { IsString } from 'class-validator';
import type { Request } from 'express';
import { Redis } from 'ioredis';
import { Pool } from 'pg';

export const usesPackages = [hash, plainToInstance, IsString, Redis, Pool];
export type UsesRequest = Request;
