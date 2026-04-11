import { describe, it, expect } from 'vitest';
import { createIPCError, isIPCError } from './errors';
import type { IPCError } from './errors';

describe('IPCError', () => {
  describe('createIPCError', () => {
    it('should create an error with code and message', () => {
      const err = createIPCError('FILE_NOT_FOUND', 'File not found');
      expect(err.code).toBe('FILE_NOT_FOUND');
      expect(err.message).toBe('File not found');
      expect(err.details).toBeUndefined();
    });

    it('should create an error with details', () => {
      const details = { path: '/test.xml' };
      const err = createIPCError('FILE_READ_ERROR', 'Read failed', details);
      expect(err.code).toBe('FILE_READ_ERROR');
      expect(err.message).toBe('Read failed');
      expect(err.details).toEqual(details);
    });
  });

  describe('isIPCError', () => {
    it('should return true for valid IPCError objects', () => {
      const err: IPCError = { code: 'INTERNAL_ERROR', message: 'Something went wrong' };
      expect(isIPCError(err)).toBe(true);
    });

    it('should return true for IPCError with details', () => {
      const err = createIPCError('UNKNOWN_ERROR', 'Unknown', { stack: 'trace' });
      expect(isIPCError(err)).toBe(true);
    });

    it('should return false for null', () => {
      expect(isIPCError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isIPCError(undefined)).toBe(false);
    });

    it('should return false for plain strings', () => {
      expect(isIPCError('error')).toBe(false);
    });

    it('should return false for objects missing code', () => {
      expect(isIPCError({ message: 'test' })).toBe(false);
    });

    it('should return false for objects missing message', () => {
      expect(isIPCError({ code: 'TEST' })).toBe(false);
    });

    it('should return false for objects with non-string code', () => {
      expect(isIPCError({ code: 123, message: 'test' })).toBe(false);
    });
  });
});
