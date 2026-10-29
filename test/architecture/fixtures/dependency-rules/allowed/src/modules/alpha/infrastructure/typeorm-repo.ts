import { Injectable } from '@nestjs/common';
import { beta } from '../../beta';
import { repoPort } from '../application/ports/repo.port';

export const repo = [Injectable, beta, repoPort];
