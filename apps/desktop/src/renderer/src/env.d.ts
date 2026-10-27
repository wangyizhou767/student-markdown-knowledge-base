/// <reference types="vite/client" />

import type { PkmApi } from '../../shared/contracts'

declare global {
  interface Window {
    pkm: PkmApi
  }
}

export {}
