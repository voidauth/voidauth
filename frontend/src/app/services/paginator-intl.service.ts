import { inject, Injectable } from '@angular/core'
import { MatPaginatorIntl } from '@angular/material/paginator'
import { TranslateService } from '@ngx-translate/core'

@Injectable()
export class PaginatorIntlService extends MatPaginatorIntl {
  private translateService = inject(TranslateService)

  constructor() {
    super()
    this.translateService.onLangChange.subscribe(() => {
      this.setLabels()
    })
    this.setLabels()
  }

  override getRangeLabel = (page: number, pageSize: number, length: number) => {
    if (length === 0 || pageSize === 0) {
      return String(this.translateService.instant('components.paginator.range-empty', { length }))
    }
    const start = page * pageSize
    const end = start < length ? Math.min(start + pageSize, length) : start + pageSize
    return String(this.translateService.instant('components.paginator.range', { start: start + 1, end, length }))
  }

  private setLabels() {
    this.itemsPerPageLabel = String(this.translateService.instant('components.paginator.items-per-page'))
    this.nextPageLabel = String(this.translateService.instant('components.paginator.next-page'))
    this.previousPageLabel = String(this.translateService.instant('components.paginator.previous-page'))
    this.firstPageLabel = String(this.translateService.instant('components.paginator.first-page'))
    this.lastPageLabel = String(this.translateService.instant('components.paginator.last-page'))
    this.changes.next()
  }
}
