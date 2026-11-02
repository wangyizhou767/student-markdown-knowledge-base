import { marked } from 'marked'
import { describe, expect, it } from 'vitest'

describe('Markdown 快捷格式', () => {
  it('使用星号正确渲染中文斜体', () => {
    expect(marked.parse('*斜体文字*', { async: false })).toContain('<em>斜体文字</em>')
  })
})
