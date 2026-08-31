import { createIdentity } from 'audiogame-utils/net';
import { storage } from './settings.js';

export const identity = createIdentity(storage);
