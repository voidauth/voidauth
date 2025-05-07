import * as fs from 'node:fs'
import * as path from 'node:path'
import nodemailer from 'nodemailer'
import pug from 'pug'
import appConfig from './config'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { REDIRECT_PATHS } from '@shared/constants'
import type { UserWithoutPassword } from '@shared/api-response/UserDetails'
import type { Invitation } from '@shared/db/Invitation'
import type { PasswordReset } from '@shared/db/PasswordReset'

export let SMTP_VERIFIED = false
const DEFAULT_EMAIL_TEMPLATE_DIR = './default_email_templates'

const transportOptions: SMTPTransport.Options = {
  host: appConfig.SMTP_HOST,
  port: appConfig.SMTP_PORT,
  secure: appConfig.SMTP_SECURE,
  auth: {
    user: appConfig.SMTP_USER,
    pass: appConfig.SMTP_PASS,
  },
}

const transporter = nodemailer.createTransport(transportOptions)
if (appConfig.SMTP_HOST) {
  transporter.verify().then(() => {
    SMTP_VERIFIED = true
    console.log('Email Connection Verified.')
  }).catch((e: unknown) => {
    console.error('Email Connection NOT Verified:')
    console.error(e)
  })
}

// move default email templates to email templates dir
fs.cpSync(DEFAULT_EMAIL_TEMPLATE_DIR, path.join('./config', 'email_templates'), {
  recursive: true,
  force: false,
})

// compile email pug templates
function compileTemplates(name: string) {
  const templates: { subject?: pug.compileTemplate, html?: pug.compileTemplate, text?: pug.compileTemplate } = {}
  const template_dir = path.join('./config', 'email_templates', name)
  if (fs.existsSync(path.join(template_dir, 'subject.pug'))) {
    templates.subject = pug.compileFile(path.join(template_dir, 'subject.pug'))
  }
  if (fs.existsSync(path.join(template_dir, 'html.pug'))) {
    templates.html = pug.compileFile(path.join(template_dir, 'html.pug'))
  }
  if (fs.existsSync(path.join(template_dir, 'text.pug'))) {
    templates.text = pug.compileFile(path.join(template_dir, 'text.pug'))
  }
  return (locals: pug.LocalsObject) => {
    return {
      subject: templates.subject ? templates.subject(locals) : undefined,
      html: templates.html ? templates.html(locals) : undefined,
      text: templates.text ? templates.text(locals) : undefined,
    }
  }
}
const emailVerificationTemplates = compileTemplates('email_verification')
const passwordResetTemplates = compileTemplates('reset_password')
const invitationTemplate = compileTemplates('invitation')

export async function sendEmailVerification(user: UserWithoutPassword, challenge: string, email: string) {
  if (!appConfig.SMTP_FROM) {
    throw new Error('Email cannot be sent without valid SMTP_FROM config value.')
  }
  if (!SMTP_VERIFIED) {
    throw new Error('SMTP transport could not be validated.')
  }

  const { subject, html, text } = emailVerificationTemplates({
    primary_color: appConfig.PRIMARY_COLOR,
    primary_contrast_color: appConfig.PRIMARY_CONTRAST_COLOR,
    app_title: appConfig.APP_TITLE,
    name: user.name || user.username,
    verification_url: `${appConfig.APP_DOMAIN}/${REDIRECT_PATHS.VERIFY_EMAIL}/${user.id}/${challenge}`,
  })

  if (!subject || (!html && !text)) {
    throw new Error('Missing email template.')
  }

  await transporter.sendMail({
    from: {
      name: appConfig.APP_TITLE,
      address: appConfig.SMTP_FROM,
    },
    to: email,
    subject: subject,
    html: html,
    text: text,
  })
}

export async function sendPasswordReset(passwordReset: PasswordReset, user: UserWithoutPassword, email: string) {
  if (!appConfig.SMTP_FROM) {
    throw new Error('Email cannot be sent without valid SMTP_FROM config value.')
  }
  if (!SMTP_VERIFIED) {
    throw new Error('SMTP transport could not be validated.')
  }

  const query = `id=${passwordReset.userId}&challenge=${passwordReset.challenge}`

  const { subject, html, text } = passwordResetTemplates({
    primary_color: appConfig.PRIMARY_COLOR,
    primary_contrast_color: appConfig.PRIMARY_CONTRAST_COLOR,
    app_title: appConfig.APP_TITLE,
    name: user.name || user.username,
    reset_url: `${appConfig.APP_DOMAIN}/${REDIRECT_PATHS.RESET_PASSWORD}?${query}`,
  })

  if (!subject || (!html && !text)) {
    throw new Error('Missing email template.')
  }

  await transporter.sendMail({
    from: {
      name: appConfig.APP_TITLE,
      address: appConfig.SMTP_FROM,
    },
    to: email,
    subject: subject,
    html: html,
    text: text,
  })
}

export async function sendInvitation(invitation: Invitation, email: string) {
  if (!appConfig.SMTP_FROM) {
    throw new Error('Email cannot be sent without valid SMTP_FROM config value.')
  }
  if (!SMTP_VERIFIED) {
    throw new Error('SMTP transport could not be validated.')
  }

  const query = `invite=${invitation.id}&challenge=${invitation.challenge}`

  const { subject, html, text } = invitationTemplate({
    primary_color: appConfig.PRIMARY_COLOR,
    primary_contrast_color: appConfig.PRIMARY_CONTRAST_COLOR,
    app_title: appConfig.APP_TITLE,
    name: invitation.name || invitation.username,
    invitation_url: `${appConfig.APP_DOMAIN}/${REDIRECT_PATHS.INVITE}?${query}`,
  })

  if (!subject || (!html && !text)) {
    throw new Error('Missing email template.')
  }

  await transporter.sendMail({
    from: {
      name: appConfig.APP_TITLE,
      address: appConfig.SMTP_FROM,
    },
    to: email,
    subject: subject,
    html: html,
    text: text,
  })
}
