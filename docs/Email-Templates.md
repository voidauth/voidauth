# Email Templates

The emails sent by VoidAuth are templated by the [ejs](https://ejs.co) files in the `/app/config/email_templates` directories. Those directories are populated with the default templates on every start, with all `*.default.ejs` templates overwritten to the current default. Those templates for each type of email include:

* subject.default.ejs
* html.default.ejs
* text.default.ejs

## Changing the Default Templates

> [!WARNING]
> Modified email templates **MUST** be renamed by removing the `.default` suffix from the file extension, as all `*.default.ejs` templates are overwritten with the current default template for each email type on each start of VoidAuth.

Updates can be made to the default `*.default.ejs` templates by renaming them to `*.ejs`. For example, in the `/app/config/email_templates/invitation` directory the `html.ejs` file will be used, if it exists, instead of the `html.default.ejs` file for templating the invitation email.

Templates use the [ejs](https://ejs.co) email templating language, and available variables for each email template are used in the `*.default.ejs` templates and can also be used in modified templates.
