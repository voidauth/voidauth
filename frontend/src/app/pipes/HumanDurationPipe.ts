import { inject, Pipe, type PipeTransform } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { getDurationResult } from '@shared/utils'
import { of, type Observable } from 'rxjs'

@Pipe({
  name: 'humanDuration',
  standalone: true,
})
export class HumanDurationPipe implements PipeTransform {
  private translate = inject(TranslateService)

  static t(milliseconds: number | null | undefined, translate: TranslateService): Observable<unknown> {
    if (milliseconds == null) {
      return of('-')
    }

    const negative = milliseconds < 0
    const result = getDurationResult(Math.abs(milliseconds))

    if (!result) {
      return translate.stream('duration.now')
    }

    const form = result.count > 1 ? 'plural' : 'singular'
    const suffix = negative ? '-ago' : ''
    return translate.stream(`duration.${result.unit}.${form}${suffix}`, { count: result.count })
  }

  transform(milliseconds: number): Observable<unknown> {
    return HumanDurationPipe.t(milliseconds, this.translate)
  }
}
