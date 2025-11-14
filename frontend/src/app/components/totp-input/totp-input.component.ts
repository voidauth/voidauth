import { Component, effect, input, output, type AfterViewInit } from '@angular/core'
import { MaterialModule } from '../../material-module'
import { ReactiveFormsModule } from '@angular/forms'
import QRCode from 'qrcode'
import { TextDividerComponent } from '../text-divider/text-divider.component'

@Component({
  selector: 'app-totp-input',
  imports: [MaterialModule, ReactiveFormsModule, TextDividerComponent],
  templateUrl: './totp-input.component.html',
  styleUrl: './totp-input.component.scss',
})
export class TotpInputComponent implements AfterViewInit {
  disabled = input<boolean>()
  uri = input<string>()
  secret = input<string>()

  qrcodeData: string | null = null

  codeFinished = output<string>()

  code: string[] = ['', '', '', '', '', '']

  constructor() {
    effect(() => {
      const uri = this.uri()
      if (uri) {
        QRCode.toDataURL(uri, {
          margin: 1,
          width: 240 * 3,
        }).then((d) => {
          this.qrcodeData = d
        }).catch((e: unknown) => {
          console.error(e)
        })
      }
    })
  }

  ngAfterViewInit(): void {
    const firstInput = document.getElementById(`totp-digit-0`)
    if (firstInput) {
      firstInput.focus()
    }
  }

  checkFinished() {
    const code = this.code.join('')
    if (code.length === 6 && /^\d*$/.test(code)) {
      this.codeFinished.emit(code)
    }
  }

  onDigitInput(event: Event, index: number) {
    const input = event.target as HTMLInputElement
    const value = input.value

    // Ensure only numeric input
    if (!/^\d*$/.test(value)) {
      input.value = value.replace(/[^\d]/g, '')
      return
    }

    // Update code array
    this.code[index] = input.value

    // Auto-move focus if digit is entered
    if (value.length === 1 && index < 6 - 1) {
      const nextInput = document.getElementById(`totp-digit-${String(index + 1)}`)
      if (nextInput) {
        nextInput.focus()
      }
    }

    this.checkFinished()
  }

  onKeyDown(event: KeyboardEvent) {
    // Get the current input element
    const currentInput = event.target as HTMLInputElement

    // Determine the current index
    const currentIndex = parseInt(currentInput.id.replace('totp-digit-', ''), 10)

    switch (event.key) {
      case 'ArrowRight':
        // Move focus to the next input if not at the last digit
        if (currentIndex < 6 - 1) {
          const nextInput = document.getElementById(`totp-digit-${String(currentIndex + 1)}`) as HTMLInputElement
          nextInput.focus()
          nextInput.select() // Select all text in the input
          event.preventDefault() // Prevent default arrow key behavior
        } else {
          currentInput.focus()
          currentInput.select() // Select all text in the input
          event.preventDefault() // Prevent default arrow key behavior
        }
        break

      case 'ArrowLeft':
        // Move focus to the previous input if not at the first digit
        if (currentIndex > 0) {
          const prevInput = document.getElementById(`totp-digit-${String(currentIndex - 1)}`) as HTMLInputElement
          prevInput.focus()
          prevInput.select() // Select all text in the input
          event.preventDefault() // Prevent default arrow key behavior
        } else {
          currentInput.focus()
          currentInput.select() // Select all text in the input
          event.preventDefault() // Prevent default arrow key behavior
        }
        break

      case 'Backspace':
        // Clear current input or move to previous input if current is empty
        if (currentInput.value === '' && currentIndex > 0) {
          const prevInput = document.getElementById(`totp-digit-${String(currentIndex - 1)}`) as HTMLInputElement
          prevInput.focus()
          prevInput.value = '' // Clear the previous input
        }
        break
    }
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault()

    // Get pasted text
    const pastedText = event.clipboardData?.getData('text') || ''

    // Remove non-numeric characters
    const cleanedText = pastedText.replace(/[^\d]/g, '')

    // Distribute pasted characters across inputs
    this.distributePastedCode(cleanedText)

    this.checkFinished()
  }

  distributePastedCode(pastedCode: string) {
    // Limit to total input length
    const trimmedCode = pastedCode.slice(0, 6)

    // Convert to array of characters
    const codeChars = trimmedCode.split('')

    // Update code array
    this.code = ['', '', '', '', '', '']

    // Populate inputs
    codeChars.forEach((char, index) => {
      if (index < 6) {
        const input = document.getElementById(`totp-digit-${String(index)}`) as HTMLInputElement
        input.value = char
        this.code[index] = char
      }
    })

    // Focus on last filled input
    this.focusLastFilledInput()
  }

  focusLastFilledInput() {
    // Wait for view to update
    setTimeout(() => {
      // Find last non-empty input
      for (let i = 6 - 1; i >= 0; i--) {
        const nextInput = document.getElementById(`totp-digit-${String(Math.min(i + 1, 6 - 1))}`)
        if (this.code[i]) {
          nextInput?.focus()
          break
        }
      }
    })
  }
}
