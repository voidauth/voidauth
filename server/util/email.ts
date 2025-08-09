import * as fs from 'node:fs'
import * as path from 'node:path'
import nodemailer from 'nodemailer'
import pug from 'pug'
import appConfig from './config'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import { ADMIN_GROUP, REDIRECT_PATHS } from '@shared/constants'
import type { Invitation } from '@shared/db/Invitation'
import type { PasswordReset } from '@shared/db/PasswordReset'
import { PRIMARY_CONTRAST_COLOR, PRIMARY_COLOR } from './theme'
import { db } from '../db/db'
import type { EmailLog } from '@shared/db/EmailLog'
import { randomUUID } from 'node:crypto'
import type { User } from '@shared/db/User'
import type { UserWithoutPassword } from '@shared/api-response/UserDetails'
import DOMPurify from 'isomorphic-dompurify'

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
      subject: templates.subject ? DOMPurify.sanitize(templates.subject(locals)) : undefined,
      html: templates.html ? DOMPurify.sanitize(templates.html(locals)) : undefined,
      text: templates.text ? DOMPurify.sanitize(templates.text(locals)) : undefined,
    }
  }
}
const emailVerificationTemplates = compileTemplates('email_verification')
const passwordResetTemplates = compileTemplates('reset_password')
const invitationTemplate = compileTemplates('invitation')
const approvedTemplate = compileTemplates('approved')
const adminNotificationTemplate = compileTemplates('admin_notification')

export async function sendEmailVerification(user: UserWithoutPassword, challenge: string, email: string) {
  if (!appConfig.SMTP_FROM) {
    throw new Error('Email cannot be sent without valid SMTP_FROM config value.')
  }
  if (!SMTP_VERIFIED) {
    throw new Error('SMTP transport could not be validated.')
  }

  const { subject, html, text } = emailVerificationTemplates({
    primary_color: PRIMARY_COLOR,
    primary_contrast_color: PRIMARY_CONTRAST_COLOR,
    app_title: appConfig.APP_TITLE,
    app_url: appConfig.APP_URL,
    name: user.name || user.username,
    verification_url: `${appConfig.APP_URL}/${REDIRECT_PATHS.VERIFY_EMAIL}/${user.id}/${challenge}`,
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

  const emailLog: EmailLog = {
    id: randomUUID(),
    type: 'email_verification',
    toUser: user.id,
    to: email,
    subject: subject,
    body: html ?? text,
    reasons: user.id,
    createdAt: new Date(),
  }

  await db().table<EmailLog>('email_log').insert(emailLog)
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
    primary_color: PRIMARY_COLOR,
    primary_contrast_color: PRIMARY_CONTRAST_COLOR,
    app_title: appConfig.APP_TITLE,
    app_url: appConfig.APP_URL,
    name: user.name || user.username,
    reset_url: `${appConfig.APP_URL}/${REDIRECT_PATHS.RESET_PASSWORD}?${query}`,
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

  const emailLog: EmailLog = {
    id: randomUUID(),
    type: 'password_reset',
    toUser: user.id,
    to: email,
    subject: subject,
    body: html ?? text,
    reasons: `${passwordReset.id},${passwordReset.userId}`,
    createdAt: new Date(),
  }

  await db().table<EmailLog>('email_log').insert(emailLog)
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
    primary_color: PRIMARY_COLOR,
    primary_contrast_color: PRIMARY_CONTRAST_COLOR,
    app_title: appConfig.APP_TITLE,
    app_url: appConfig.APP_URL,
    name: invitation.name || invitation.username,
    invitation_url: `${appConfig.APP_URL}/${REDIRECT_PATHS.INVITE}?${query}`,
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

  const emailLog: EmailLog = {
    id: randomUUID(),
    type: 'invitation',
    to: email,
    subject: subject,
    body: html ?? text,
    reasons: invitation.id,
    createdAt: new Date(),
  }

  await db().table<EmailLog>('email_log').insert(emailLog)
}

export async function sendApproved(user: Pick<User, 'id' | 'username' | 'name'>, email: string) {
  if (!appConfig.SMTP_FROM) {
    throw new Error('Email cannot be sent without valid SMTP_FROM config value.')
  }
  if (!SMTP_VERIFIED) {
    throw new Error('SMTP transport could not be validated.')
  }

  const { subject, html, text } = approvedTemplate({
    primary_color: PRIMARY_COLOR,
    primary_contrast_color: PRIMARY_CONTRAST_COLOR,
    app_title: appConfig.APP_TITLE,
    app_url: appConfig.APP_URL,
    name: user.name || user.username,
    default_url: appConfig.DEFAULT_REDIRECT || appConfig.APP_URL,
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

  const emailLog: EmailLog = {
    id: randomUUID(),
    type: 'approved',
    toUser: user.id,
    to: email,
    subject: subject,
    body: html ?? text,
    reasons: user.id,
    createdAt: new Date(),
  }

  await db().table<EmailLog>('email_log').insert(emailLog)
}

export async function sendAdminNotifications() {
  if (!appConfig.ADMIN_EMAILS || !appConfig.SMTP_FROM || !SMTP_VERIFIED) {
    return
  }

  const adminUsers: User[] = await db().select<User[]>('user.*').table<User>('user')
    .innerJoin('user_group', 'user_group.userId', 'user.id')
    .innerJoin('group', 'group.id', 'user_group.groupId')
    .where('group.name', ADMIN_GROUP).and.whereNotNull('email')
    .andWhereNot({ email: 'admin@localhost' }) // handle historic default admin email

  if (!adminUsers.length) {
    return
  }

  // Reasons for admin notification
  // Checking that the events happened in the span after the last admin notification email could have
  // been sent, which is an approximation
  const approvalsNeeded = appConfig.SIGNUP_REQUIRES_APPROVAL ? await db().select().table<User>('user').where({ approved: false }) : []

  if (!approvalsNeeded.length) {
    return
  }

  const approvalEmailsSent = await db().select('toUser', 'reasons', 'to').table<EmailLog>('email_log')
    .where({ type: 'admin_notification' })
    .andWhere((w) => {
      let count = 0
      for (const approval of approvalsNeeded) {
        if (count === 0) {
          w.whereLike('reasons', `%${approval.id}%`)
        } else {
          w.orWhereLike('reasons', `%${approval.id}%`)
        }
        count++
      }
    })

  for (const admin of adminUsers) {
    const email = admin.email as string // will be string, filtered null out in query

    const previousSend = new Date(new Date().getTime() - (appConfig.ADMIN_EMAILS * 1000))

    // Get the latest admin notification email sent for this user/email
    const recentAdminEmail = await db().select().table<EmailLog>('email_log').where((w) => {
      w.where({ toUser: admin.id })
      w.orWhere({ to: email })
    }).andWhere({ type: 'admin_notification' })
      .andWhere('createdAt', '>=', previousSend)
      .orderBy('createdAt', 'desc').first()

    if (recentAdminEmail) {
      continue
    }

    const approvalNotifications = approvalsNeeded.filter((u) => {
      return !approvalEmailsSent.some((e) => {
        return (e.toUser === admin.id || e.to === admin.email) && e.reasons?.includes(u.id)
      })
    })

    // If there was no previous email, or if it was longer than ADMIN_EMAILS ago, send
    if (approvalNotifications.length) {
      const { subject, html, text } = adminNotificationTemplate({
        primary_color: PRIMARY_COLOR,
        primary_contrast_color: PRIMARY_CONTRAST_COLOR,
        app_title: appConfig.APP_TITLE,
        app_url: appConfig.APP_URL,
        users: approvalNotifications.map(u => u.username),
        users_url: `${appConfig.APP_URL}/admin/users`,
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

      const emailLog: EmailLog = {
        id: randomUUID(),
        type: 'admin_notification',
        to: email,
        toUser: admin.id,
        subject: subject,
        body: html ?? text,
        reasons: approvalNotifications.map(a => a.id).join(','),
        createdAt: new Date(),
      }

      await db().table<EmailLog>('email_log').insert(emailLog)
    }
  }
}
