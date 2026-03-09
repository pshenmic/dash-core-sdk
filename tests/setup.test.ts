import { describe, it, expect } from '@jest/globals'

describe('Jest setup verification', () => {
  it('should run basic test', () => {
    expect(true).toBe(true)
  })

  it('should perform simple math', () => {
    expect(1 + 1).toBe(2)
  })
})
