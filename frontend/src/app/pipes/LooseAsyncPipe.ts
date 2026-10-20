import { AsyncPipe } from '@angular/common'
import { ChangeDetectorRef, Pipe, type OnDestroy, type PipeTransform } from '@angular/core'
import { Observable, isObservable, of, type Subscribable } from 'rxjs'

type CastedValue = Observable<unknown> | Subscribable<unknown> | PromiseLike<unknown> | null | undefined

@Pipe({
  name: 'looseAsync',
  pure: false,
  standalone: true,
})
export class LooseAsyncPipe implements OnDestroy, PipeTransform {
  private _asyncPipe: AsyncPipe
  private _hasValue = false
  private _lastValue: unknown
  private _castedValue: CastedValue = null

  constructor(ref: ChangeDetectorRef) {
    this._asyncPipe = new AsyncPipe(ref)
  }

  static cast(value: unknown): CastedValue {
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
    if (!this._hasValue || !Object.is(value, this._lastValue)) {
      this._lastValue = value
      this._castedValue = LooseAsyncPipe.cast(value)
      this._hasValue = true
    }

    return this._asyncPipe.transform(this._castedValue)
  }

  ngOnDestroy() {
    this._asyncPipe.ngOnDestroy()
  }
}
