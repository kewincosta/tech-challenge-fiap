# 0036. E-mail goes through a Mailer port over SMTP

**Status**: Accepted
**Source**: AD-020 in `.specs/STATE.md`
**Recorded**: 2026-11-01, from AD-020, taken during the `work-order-phase-2-api` feature

## Context

Nothing in the system wrote to a customer. A work order changed status, the trail kept the fact, and
the customer learned of it by asking the workshop or calling the API. The Phase 2 brief asks for
status updates by e-mail or a similar tool, and the user decided on 2026-11-01 that the customer
receives an e-mail at every status change, the opening included, and that an e-mail which fails is
logged and not sent again.

[ADR 0031](0031-patterns-kept-beyond-the-dependency-rule.md) already named this reaction: domain
events reach their subscribers through a dispatcher that does not wait for them, so no use case
knows who listens.

## Decision

`work-orders` declares a `Mailer` port in `application/ports`. A message holds the recipient, the
subject, the plain text and the HTML. `SmtpMailer` in `infrastructure/mail` implements the port with
`nodemailer` over SMTP, and the composition root builds it from five settings: `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`. The environment validation requires the
host, the port and the sender at boot. The user and the password are optional, for a server that
asks for no login.

Every transition of a work order, the opening included, records one `WorkOrderStatusChanged` event
with the old and the new status. An approval records it once, though its trail keeps `BudgetApproved`
and `ExecutionStarted`. The event feeds no `work_order_events` row, so the trail stays as it was
([ADR 0021](0021-the-trail-written-inside-the-aggregate-transaction.md)). It carries the work order's
number, customer and vehicle plate, and the pending budget when the new status is
`AWAITING_APPROVAL`, because a subscriber runs after the work order may have moved again.

`StatusMailSubscriber` receives the event after the commit. The module root registers it on the
dispatcher the way the identity module registers its subscribers. It reads the customer's name and
e-mail through the `CustomerDirectory` port, composes the message in Portuguese and hands it to the
`Mailer`:

- The subject is `Ordem de serviço ${number}: ${statusLabel}`, with the label of the status from
  `statusLabel` (`Recebida`, `Diagnóstico`, `Aguardando Aprovação`, `Execução`, `Finalizada`,
  `Entregue`, `Cancelada`).
- The body names the customer, the work order number, the vehicle plate and the new label. The HTML
  version carries the same paragraphs, with every value escaped.
- For `AWAITING_APPROVAL` the body adds the budget total in reais and the two links that decide that
  budget ([ADR 0037](0037-how-the-phase-2-briefs-api-items-are-read.md)).
- The sender is `MAIL_FROM`, `Oficina <no-reply@workshop.local>` in `.env.example`.

A failure, in the customer's lookup or in the mail server, is caught in the subscriber and logged at
error level with the work order number and the error, through the `StatusMailLog` port. Nothing
sends the e-mail again, and the request that changed the status answers as it would with no e-mail.

`docker-compose.yml` gains a `mailpit` service (`axllent/mailpit`) that takes SMTP on port 1025 and
shows the inbox at `http://localhost:8025`. `.env.example` points the settings at it, and the `app`
service reaches it as `mailpit:1025`. The end-to-end suites replace the `Mailer` with a fake that
records what it was asked to send, so no suite needs a mail server.

## Alternatives

A provider's HTTP API, such as SendGrid or Resend, was rejected. It asks for an account and a key
even for a local run, and it ties the code to one vendor. SMTP runs against any server, and Mailpit
needs no account.

Running without a local mail server was rejected. Every e-mail would fail and log an error on a
developer's machine, and a demonstration would show no e-mail.

Calling the mailer from each use case that changes the status was rejected, for the reason in ADR
0031: the use case would know about the e-mail, and a new channel would change every use case.

An outbox with retries, the shape of [ADR 0033](0033-writes-across-modules-run-as-steps.md), was
rejected. The user chose to log the failure. A table of pending e-mails and a processor become worth
building if lost e-mails start to matter.

## Consequences

An e-mail can be lost. The mail server may be down, and the process may stop between the commit and
the send. The log line names the work order, so the workshop can write to the customer by hand.

Two transitions a few milliseconds apart start two subscribers that run side by side, so their
e-mails can arrive out of order.

A `.env` made before this change has no mail settings, and the application refuses to start until
they are copied from `.env.example`.

The customer's address is the one of their account, read when the e-mail is sent. A customer who
changes it between the change and the send gets the e-mail at the new address.
