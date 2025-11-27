# Email Templates

The emails sent by VoidAuth are templated by the [pug](https://pugjs.org/api/getting-started.html) files in the `/app/config/email_templates` directories. Those directories are populated with the default templates on every start, with all `*.default.pug` templates overwritten to the current default. Those templates for each type of email include:

* subject.default.pug
* html.default.pug
* text.default.pug

## Changing the Default Templates

> [!WARNING]
> Modified email templates **MUST** be renamed by removing the `.default` suffix from the file extension, as all `*.default.pug` templates are overwritten with the current default template for each email type on each start of VoidAuth.

Updates can be made to the default `*.default.pug` templates by renaming them to `*.pug`. For example, in the `/app/config/email_templates/invitation` directory the `html.pug` file will be used, if it exists, instead of the `html.default.pug` file for templating the invitation email.

Templates use the [pug](https://pugjs.org/api/getting-started.html) email templating language, and available variables for each email template are used in the `*.default.pug` templates and can also be used in your modified templates.
