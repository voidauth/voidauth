# Usage

## Login
Users are directed to the login portal if they are not already signed into VoidAuth and they either visit the **APP_URL** directly or are redirected there through the **OIDC Client** or **Proxy Auth** flows. VoidAuth supports password login, as well as passkey login (Face ID, Windows Hello, etc). There is also a "Forgot Password" option, which will redirect to the [Forgot Password](#forgot-password) page. The "Remember Me" checkbox will attempt to make the user session last through device restarts for up to one year, as long as the user signs in with their password instead of any other method.

<p align=center>
<img align=center src="https://github.com/user-attachments/assets/2f8c15db-28fd-4b0e-a266-1dddd9cf9e3a" width="300" />
</p>

## Sign Up
If the **SIGNUP** environment variable is set, there will be an option on the [Login](#login) page to Sign Up. A username is required, and so is an email if the **EMAIL_VERIFICATION** environment variable is set. Password strength requirements are set by the **PASSWORD_STRENGTH** environment variable. The current password strength is calculated with [zxcvbn-ts](https://zxcvbn-ts.github.io/zxcvbn/).

<p align=center>
<img src="https://github.com/user-attachments/assets/f7388e03-5856-411b-a111-0bd9fc1d1df1" width="300" />
</p>

## Accept Invitation
Shown if a user visits an active invitation link, this page has the same fields as the [Sign Up](#sign-up) form but with any fields already filled in by the admin populated and disabled.
<p align=center>
<img src="https://github.com/user-attachments/assets/ebfa072b-a218-4afa-afab-a89be3159638" width="300" />
</p>

## Forgot Password
Shown when the "Forgot Password" button on the login page is clicked, here a user can enter their username or email and receive a [Reset Password](#reset-password) link.
<p align=center>
<img src="https://github.com/user-attachments/assets/0b408bca-993f-452d-a6f3-b2e5a70ed4dc" width="300" />
</p>

## Profile Settings
The default page when a user navigates directly to VoidAuth, here a user can change their profile settings, email address, password, or add a passkey.
<p align=center>
<img src="https://github.com/user-attachments/assets/091a0122-75d7-44d0-9c97-e395c945cf4f" width="300" />
</p>

The passkey options will only show if a user's session was not started with a passkey and they have not created a passkey with the current session. When a user login directly to VoidAuth is complete with a method other than a passkey, it will attempt to automatically add a passkey.