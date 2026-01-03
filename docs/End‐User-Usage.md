# User Experience

## Login
Users are directed to the login portal if they are not already signed into VoidAuth and they either visit the **APP_URL** directly or are redirected there through the **OIDC Client** or **Proxy Auth** flows. VoidAuth supports password login, as well as passkey login (Face ID, Windows Hello, etc). There is also a "Forgot Password" option, which will redirect to the [Forgot Password](#forgot-password) page. The "Remember Me" checkbox will attempt to make the user session last through device restarts for up to one year, as long as the user signs in with their password instead of any other method.

<p align=center>
<img src="/public/screenshots/login_page.png" width="375" />
</p>

## Multi-Factor Authentication (MFA)
Users are sent to the Multi-Factor Authentication page if they require MFA due to global policy, group membership, or the security policy of the OIDC Client or ProxyAuth Domain they are visiting. If a user does not have a MFA method available on their account but one is required, they will have the opportunity to set one up on this page.

<p align=center>
<img src="/public/screenshots/mfa_required.png" width="375" />
</p>

<p align=center>
<img src="/public/screenshots/mfa_required_register.png" width="375" />
</p>

## Sign Up
If the **SIGNUP** environment variable is set, there will be an option on the [Login](#login) page to Sign Up. A username is required, and so is an email if the **EMAIL_VERIFICATION** environment variable is set. Password strength requirements are set by the **PASSWORD_STRENGTH** environment variable. Password strength is calculated with [zxcvbn-ts](https://zxcvbn-ts.github.io/zxcvbn/).

<p align=center>
<img src="/public/screenshots/sign_up.png" width="375" />
</p>

## Accept Invitation
Shown if a user visits an active invitation link, this page has the same fields as the [Sign Up](#sign-up) form but with any fields already filled in by the admin pre-populated.

## Passkeys
After a user finishes on the [Login](#login) or [Sign Up](#sign-up) pages by using a password, they may be prompted to create a passkey if their device supports them.

<p align=center>
<img src="/public/screenshots/passkey_dialog.png" width="375" />
</p>

For a user to add additional passkeys to their account and onboard new devices they can either: login on that device with a password, or visit the [Profile Settings](#profile-settings) page and register a hardware or external passkey on an existing device. To register a passkey on an external device, they should visit the 'Security' tab on the [Profile Settings](#profile-settings) page, click the 'Register Passkey' button, and follow their device passkey provider instructions for Using Another Device.

<p align=center>
<img src="/public/screenshots/security_tab.png" width="375" />
</p>

<p align=center>
<img src="/public/screenshots/windows_hello_external.png" width="375" />
</p>

## Forgot Password
Shown when the "Forgot Password" button on the login page is clicked, here a user can enter their username or email and receive a [Reset Password](#reset-password) link.
<p align=center>
<img src="/public/screenshots/0b408bca-993f-452d-a6f3-b2e5a70ed4dc.png" width="375" />
</p>

## Reset Password
Show when user follows a password reset link either from email or sent by an admin. Users may choose to add an additional passkey instead of resetting their password.

<p align=center>
<img src="/public/screenshots/reset_password.png" width="375" />
</p>

## Profile Settings
The default page when a user navigates directly to VoidAuth, here a user can change their profile settings, email address, password, add a passkey, or manage their account.
<p align=center>
<img src="/public/screenshots/091a0122-75d7-44d0-9c97-e395c945cf4f.png" width="375" />
</p>
