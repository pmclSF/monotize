import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  formatList,
  formatHeader,
  formatKeyValue,
} from '../../../src/utils/logger.js';

describe('Logger Utilities', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('createLogger', () => {
    it('should create a logger with all methods', () => {
      const logger = createLogger();

      expect(logger.info).toBeDefined();
      expect(logger.success).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.debug).toBeDefined();
      expect(logger.log).toBeDefined();
    });

    it('should log info messages', () => {
      const logger = createLogger();
      logger.info('Test info message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should log success messages', () => {
      const logger = createLogger();
      logger.success('Test success message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should log warning messages', () => {
      const logger = createLogger();
      logger.warn('Test warning message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      const logger = createLogger();
      logger.error('Test error message');

      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should not log debug messages when verbose is false', () => {
      const logger = createLogger(false);
      logger.debug('Test debug message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should log debug messages when verbose is true', () => {
      const logger = createLogger(true);
      logger.debug('Test debug message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('should log plain messages', () => {
      const logger = createLogger();
      logger.log('Plain message');

      expect(consoleSpy.log).toHaveBeenCalled();
    });
  });

  describe('formatList', () => {
    it('should format a list of items with bullets', () => {
      const items = ['item1', 'item2', 'item3'];
      const result = formatList(items);

      expect(result).toContain('item1');
      expect(result).toContain('item2');
      expect(result).toContain('item3');
    });

    it('should handle empty list', () => {
      const result = formatList([]);
      expect(result).toBe('');
    });

    it('should handle single item', () => {
      const result = formatList(['single']);
      expect(result).toContain('single');
    });

    it('should indent items', () => {
      const result = formatList(['test']);
      // Should have some indentation
      expect(result.startsWith(' ') || result.startsWith('\n')).toBe(true);
    });
  });

  describe('formatHeader', () => {
    it('should format a header string', () => {
      const result = formatHeader('Test Header');

      expect(result).toContain('Test Header');
    });

    it('should handle empty header', () => {
      const result = formatHeader('');
      expect(result).toBeDefined();
    });

    it('should handle special characters', () => {
      const result = formatHeader('Header with $pecial Ch@rs!');
      expect(result).toContain('Header with $pecial Ch@rs!');
    });
  });

  describe('formatKeyValue', () => {
    it('should format key-value pair', () => {
      const result = formatKeyValue('Key', 'Value');

      expect(result).toContain('Key');
      expect(result).toContain('Value');
    });

    it('should handle empty key', () => {
      const result = formatKeyValue('', 'Value');
      expect(result).toContain('Value');
    });

    it('should handle empty value', () => {
      const result = formatKeyValue('Key', '');
      expect(result).toContain('Key');
    });

    it('should handle numeric values as strings', () => {
      const result = formatKeyValue('Count', '42');
      expect(result).toContain('42');
    });
  });
});
