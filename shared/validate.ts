import { COLUMNS, LIMITS } from './types.js';
import type { ClientWsMessage, ColumnId } from './types.js';

export class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

const COLUMN_IDS: string[] = COLUMNS.map((c) => c.id);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isColumnId(value: unknown): value is ColumnId {
  return typeof value === 'string' && COLUMN_IDS.includes(value);
}

export function columnTitle(id: string): string {
  return COLUMNS.find((c) => c.id === id)?.title ?? id;
}

function text(value: unknown, field: string, max: number, required: boolean): string {
  if (typeof value !== 'string') throw new SyncError(`${field} must be a string`);
  const trimmed = value.trim();
  if (required && trimmed.length === 0) throw new SyncError(`${field} is required`);
  if (trimmed.length > max) throw new SyncError(`${field} must be at most ${max} characters`);
  return trimmed;
}

export function validateTitle(value: unknown): string {
  return text(value, 'title', LIMITS.titleMax, true);
}

export function validateContent(value: unknown): string {
  return text(value, 'content', LIMITS.contentMax, false);
}

export function validateName(value: unknown, field = 'user_name'): string {
  return text(value, field, LIMITS.nameMax, true);
}

function id(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > LIMITS.idMax) {
    throw new SyncError('id must be a non-empty string');
  }
  return value;
}

function column(value: unknown): ColumnId {
  if (!isColumnId(value)) throw new SyncError(`column must be one of ${COLUMN_IDS.join(', ')}`);
  return value;
}

function version(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SyncError('version must be a non-negative integer');
  }
  return value;
}

/**
 * Turns an untrusted decoded frame into a typed client message or throws a
 * SyncError that is safe to show to the sender.
 */
export function parseClientMessage(input: unknown): ClientWsMessage {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new SyncError('Message must be a JSON object');
  }
  const m = input as Record<string, unknown>;
  switch (m.type) {
    case 'join_board': {
      const color = typeof m.color === 'string' && HEX_COLOR.test(m.color) ? m.color : '#0b6bcb';
      return {
        type: 'join_board',
        board_id: id(m.board_id),
        user_name: validateName(m.user_name),
        color,
      };
    }
    case 'card_create':
      return {
        type: 'card_create',
        title: validateTitle(m.title),
        content: validateContent(m.content ?? ''),
        column: column(m.column ?? 'backlog'),
      };
    case 'card_move': {
      const index = m.index;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
        throw new SyncError('index must be a non-negative integer');
      }
      return {
        type: 'card_move',
        id: id(m.id),
        column: column(m.column),
        index,
        version: version(m.version),
      };
    }
    case 'card_update':
      return {
        type: 'card_update',
        id: id(m.id),
        title: validateTitle(m.title),
        content: validateContent(m.content ?? ''),
        version: version(m.version),
      };
    case 'card_lock':
    case 'card_unlock':
    case 'card_delete':
      return { type: m.type, id: id(m.id) };
    case 'heartbeat':
      return { type: 'heartbeat' };
    default:
      throw new SyncError('Unknown message type');
  }
}
