import { Injectable } from '@angular/core'

const MIN_PAGE_SIZE = 10
const MAX_PAGE_SIZE = 1000

@Injectable({
  providedIn: 'root',
})
export class TableService {
  private readonly storageKey = 'voidauth-current-page-size'
  private _currentPageSize: number | null = null

  constructor() {
    this._currentPageSize = this.getCurrentPageSize()
  }

  get currentPageSize(): number | null {
    return this._currentPageSize
  }

  set currentPageSize(pageSize: number | null) {
    this.setCurrentPageSize(pageSize)
  }

  private getCurrentPageSize(): number | null {
    const localStorageValue = localStorage.getItem(this.storageKey)

    if (!localStorageValue) {
      return null
    }

    const storedPageSize = this.normalizePageSize(Number.parseInt(localStorageValue, 10))
    return storedPageSize
  }

  private setCurrentPageSize(pageSize: number | null): void {
    if (pageSize === null) {
      this._currentPageSize = null
      localStorage.removeItem(this.storageKey)
      return
    }

    const normalizedPageSize = this.normalizePageSize(pageSize)
    this._currentPageSize = normalizedPageSize
    localStorage.setItem(this.storageKey, String(normalizedPageSize))
  }

  private normalizePageSize(pageSize: number): number | null {
    if (!Number.isFinite(pageSize)) {
      return null
    }

    if (pageSize < MIN_PAGE_SIZE) {
      return MIN_PAGE_SIZE
    }

    if (pageSize > MAX_PAGE_SIZE) {
      return MAX_PAGE_SIZE
    }

    return pageSize
  }
}
