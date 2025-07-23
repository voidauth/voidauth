# User Management

User management can be accessed by admins (users in the **auth_admins** group) in the sidebar under [Invitations](#invitations) and [Users](#users).
> [!IMPORTANT]
> Users cannot be created, only invited. This means an end-user will always be able to choose their own password, though the admin can choose their username and initial profile settings if they want.

## Invitations
The Invitation Create/Update page.

<img width="500" alt="image" src="https://github.com/user-attachments/assets/56ee1ad4-7f4c-4b49-8484-da5b6cd7256c" />

When an invitation is created, the future-user's username and initial profile settings can be chosen. Any fields that are not filled in can be filled by the user when accepting the invitation, though either the username or email must be pre-filled. The users initial security groups can also be selected here.

Once the invitation is created, the invitation link will be generated and displayed at the top of the page. The invitation link can be sent by email if the invitation has an email address attached and VoidAuth is connected to an email provider, or the link can be copied and sent directly.

> [!IMPORTANT]
> Invited users are always 'approved', and if an admin set their initial email address that email will be verified when they accept the invitation.

## Registration
> [!WARNING]
> Under construction...

User self-registration is available if the **SIGNUP** environment variable is set to 'true'.

## Users
The Users Update page.

<img width="500" alt="image" src="https://github.com/user-attachments/assets/4122f143-e016-4dde-a6d2-4dbb5e3c9ef4" />

On the User Update page all of the users profile settings and username can be changed. The user's security groups, email verification, and approval status can also be set.