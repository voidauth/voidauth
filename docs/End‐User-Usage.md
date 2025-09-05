# Usage

## Login
Users are directed to the login portal if they are not already signed into VoidAuth and they either visit the **APP_URL** directly or are redirected there through the **OIDC Client** or **Proxy Auth** flows. VoidAuth supports password login, as well as passkey login (Face ID, Windows Hello, etc). There is also a "Forgot Password" option, which will redirect to the [Forgot Password](#forgot-password) page. The "Remember Me" checkbox will attempt to make the user session last through device restarts for up to one year, as long as the user signs in with their password instead of any other method.

<p align=center>
<img align=center src="/public/screenshots/2f8c15db-28fd-4b0e-a266-1dddd9cf9e3a.png" width="375" />
</p>

## Sign Up
If the **SIGNUP** environment variable is set, there will be an option on the [Login](#login) page to Sign Up. A username is required, and so is an email if the **EMAIL_VERIFICATION** environment variable is set. Password strength requirements are set by the **PASSWORD_STRENGTH** environment variable. The current password strength is calculated with [zxcvbn-ts](https://zxcvbn-ts.github.io/zxcvbn/).

<p align=center>
<img src="/public/screenshots/sign_up.png" width="375" />
</p>

## Accept Invitation
Shown if a user visits an active invitation link, this page has the same fields as the [Sign Up](#sign-up) form but with any fields already filled in by the admin pre-populated.

## Passkeys
After a user finishes on the Login or Sign Up pages by using a password, they may be prompted to create a passkey if their device supports them.

<p align=center>
<img src="/public/screenshots/passkey_dialog.png" width="375" />
</p>

## Forgot Password
Shown when the "Forgot Password" button on the login page is clicked, here a user can enter their username or email and receive a [Reset Password](#reset-password) link.
<p align=center>
<img src="/public/screenshots/0b408bca-993f-452d-a6f3-b2e5a70ed4dc.png" width="375" />
</p>

## Reset Password
Show when user follows a password reset link either from email or sent by an admin.
<p align=center>
<img src="/public/screenshots/reset_password.png" width="375" />
</p>

## Profile Settings
The default page when a user navigates directly to VoidAuth, here a user can change their profile settings, email address, password, or add a passkey.
<p align=center>
<img src="/public/screenshots/091a0122-75d7-44d0-9c97-e395c945cf4f.png" width="375" />
</p>
