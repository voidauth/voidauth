import { AsyncPipe } from '@angular/common'
import { ChangeDetectorRef, Pipe, type PipeTransform } from '@angular/core'
import { Observable, isObservable, of, type Subscribable } from 'rxjs'

@Pipe({
  name: 'looseAsync',
  pure: true,
  standalone: true,
})
export class LooseAsyncPipe implements PipeTransform {
  private _asyncPipe: AsyncPipe
  constructor(ref: ChangeDetectorRef) {
    this._asyncPipe = new AsyncPipe(ref)
  }

  static cast(value: unknown): Observable<unknown> | Subscribable<unknown> | PromiseLike<unknown> | null | undefined {
    if (isObservable(value)) {
      return value
    }

    if (value instanceof Promise || (value && typeof value === 'object' && 'then' in value && typeof value.then === 'function')) {
      return value as PromiseLike<unknown>
    }

    if (value && typeof value === 'object' && 'subscribe' in value && typeof value.subscribe === 'function') {
      return value as Subscribable<unknown>
    }

    return of(value)
  }

  transform(value: unknown): unknown {
    const castedValue = LooseAsyncPipe.cast(value)
    return this._asyncPipe.transform(castedValue)
  }
}
