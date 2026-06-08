import { describe, it, expect } from 'vitest';
import { validateClientMessage } from '../src/protocol/messages.js';

describe('ClientMessage validation', () => {
  it('should accept valid auth message', () => {
    const result = validateClientMessage({
      type: 'auth',
      payload: { token: 'valid-jwt-token' },
    });
    expect(result.ok).toBe(true);
  });

  it('should reject auth with empty token', () => {
    const result = validateClientMessage({
      type: 'auth',
      payload: { token: '' },
    });
    expect(result.ok).toBe(false);
  });

  it('should accept valid input message', () => {
    const result = validateClientMessage({
      type: 'input',
      payload: {
        tick: 1,
        throttle: 0.5,
        boost: false,
        fire: false,
        mine: false,
        torque: { x: 0, y: 0, z: 0 },
        thrust: { x: 0, y: 0, z: 0 },
        mode: 'flight_assist',
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('should reject input with invalid throttle', () => {
    const result = validateClientMessage({
      type: 'input',
      payload: {
        tick: 1,
        throttle: 1.5, // > 1.0
        boost: false,
        fire: false,
        mine: false,
        torque: { x: 0, y: 0, z: 0 },
        thrust: { x: 0, y: 0, z: 0 },
        mode: 'flight_assist',
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
    expect(result.ok).toBe(false);
  });

  it('should accept valid trade_buy', () => {
    const result = validateClientMessage({
      type: 'trade_buy',
      payload: { goodId: 'water', quantity: 5 },
    });
    expect(result.ok).toBe(true);
  });

  it('should reject trade_buy with negative quantity', () => {
    const result = validateClientMessage({
      type: 'trade_buy',
      payload: { goodId: 'water', quantity: -1 },
    });
    expect(result.ok).toBe(false);
  });

  it('should accept valid chat_message', () => {
    const result = validateClientMessage({
      type: 'chat_message',
      payload: { text: 'Hello world' },
    });
    expect(result.ok).toBe(true);
  });

  it('should reject chat_message with empty text', () => {
    const result = validateClientMessage({
      type: 'chat_message',
      payload: { text: '' },
    });
    expect(result.ok).toBe(false);
  });

  it('should reject chat_message with too long text', () => {
    const result = validateClientMessage({
      type: 'chat_message',
      payload: { text: 'x'.repeat(501) },
    });
    expect(result.ok).toBe(false);
  });

  it('should accept valid fire_bolt', () => {
    const result = validateClientMessage({
      type: 'fire_bolt',
      payload: {
        pos: { x: 1, y: 2, z: 3 },
        dir: { x: 0, y: 0, z: 1 },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('should reject unknown message type', () => {
    const result = validateClientMessage({
      type: 'unknown_type',
      payload: {},
    });
    expect(result.ok).toBe(false);
  });

  it('should reject malformed JSON-like objects', () => {
    const result = validateClientMessage({
      type: 'input',
      // missing payload entirely
    });
    expect(result.ok).toBe(false);
  });

  it('should accept valid jump_request', () => {
    const result = validateClientMessage({
      type: 'jump_request',
      payload: { targetSystem: 3 },
    });
    expect(result.ok).toBe(true);
  });

  it('should reject jump_request with negative system', () => {
    const result = validateClientMessage({
      type: 'jump_request',
      payload: { targetSystem: -1 },
    });
    expect(result.ok).toBe(false);
  });
});
