import { WorkflowDefinition } from "../nodes/types";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  defaultStatus: "enabled" | "disabled";
  definition: WorkflowDefinition;
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "lead-processing",
    name: "Lead Processing",
    description:
      "Webhook receives a lead, validates the email, stores valid leads in the database and notifies sales. Invalid leads are logged.",
    defaultStatus: "enabled",
    definition: {
      nodes: [
        {
          id: "webhook_trigger",
          type: "webhook",
          label: "Webhook",
          position: { x: 60, y: 160 },
          config: { method: "POST", secret: "" },
        },
        {
          id: "validate_request",
          type: "transform",
          label: "Validate Request",
          position: { x: 340, y: 160 },
          config: {
            mode: "mapping",
            output: {
              email: "{{webhook.email}}",
              name: "{{webhook.name}}",
              company: "{{webhook.company}}",
            },
          },
        },
        {
          id: "check_email",
          type: "condition",
          label: "Check Email",
          position: { x: 620, y: 160 },
          config: { variable: "webhook.email", operator: "contains", value: "@gmail.com" },
        },
        {
          id: "store_lead",
          type: "database",
          label: "Store Lead",
          position: { x: 900, y: 40 },
          config: {
            operation: "upsert",
            table: "lead",
            data: {
              email: "{{webhook.email}}",
              name: "{{webhook.name}}",
              company: "{{webhook.company}}",
              source: "webhook",
            },
            where: { email: "{{webhook.email}}" },
            help: "Upsert keeps the demo re-runnable — the same webhook payload never collides on a unique email.",
          },
        },
        {
          id: "send_email",
          type: "email",
          label: "Send Email",
          position: { x: 1180, y: 40 },
          config: {
            to: "sales@example.com",
            subject: "New lead: {{webhook.name}}",
            body: "A new lead just arrived:\n\nName: {{webhook.name}}\nEmail: {{webhook.email}}\nCompany: {{webhook.company}}\n\n— FlowForge",
          },
        },
        {
          id: "log_failure",
          type: "log",
          label: "Log Failure",
          position: { x: 900, y: 300 },
          config: {
            level: "warn",
            message: "Lead rejected: {{webhook.email}} did not match the email criteria",
          },
        },
      ],
      edges: [
        { id: "e1", source: "webhook_trigger", target: "validate_request" },
        { id: "e2", source: "validate_request", target: "check_email" },
        { id: "e3", source: "check_email", target: "store_lead", sourceHandle: "true" },
        { id: "e4", source: "store_lead", target: "send_email" },
        { id: "e5", source: "check_email", target: "log_failure", sourceHandle: "false" },
      ],
    },
  },
  {
    id: "api-data-sync",
    name: "API Data Sync",
    description:
      "On an hourly schedule, fetches a customer from a public API, transforms the response and upserts it into the database.",
    defaultStatus: "enabled",
    definition: {
      nodes: [
        {
          id: "sync_schedule",
          type: "schedule",
          label: "Schedule",
          position: { x: 60, y: 160 },
          config: { cron: "0 * * * *", timezone: "UTC" },
        },
        {
          id: "fetch_customer",
          type: "http_request",
          label: "Fetch Customer",
          position: { x: 340, y: 160 },
          config: {
            method: "GET",
            url: "https://jsonplaceholder.typicode.com/users/1",
            headers: [{ key: "Accept", value: "application/json" }],
            queryParams: [],
            body: "",
            authType: "none",
            timeoutMs: 10000,
            retries: 2,
            retryDelayMs: 1000,
          },
        },
        {
          id: "transform_customer",
          type: "transform",
          label: "Transform",
          position: { x: 620, y: 160 },
          config: {
            mode: "mapping",
            output: {
              email: "{{http_request.data.email}}",
              name: "{{http_request.data.name}}",
              company: "{{http_request.data.company.name}}",
              phone: "{{http_request.data.phone}}",
            },
          },
        },
        {
          id: "upsert_customer",
          type: "database",
          label: "Upsert Lead",
          position: { x: 900, y: 160 },
          config: {
            operation: "upsert",
            table: "lead",
            where: { email: "{{http_request.data.email}}" },
            data: {
              email: "{{http_request.data.email}}",
              name: "{{http_request.data.name}}",
              company: "{{http_request.data.company.name}}",
              source: "api-sync",
            },
          },
        },
      ],
      edges: [
        { id: "e1", source: "sync_schedule", target: "fetch_customer" },
        { id: "e2", source: "fetch_customer", target: "transform_customer" },
        { id: "e3", source: "transform_customer", target: "upsert_customer" },
      ],
    },
  },
  {
    id: "webhook-notification",
    name: "Webhook Notification",
    description:
      "Listens for webhook submissions and sends an email notification with the submitted details.",
    defaultStatus: "disabled",
    definition: {
      nodes: [
        {
          id: "notify_webhook",
          type: "webhook",
          label: "Webhook",
          position: { x: 60, y: 160 },
          config: { method: "POST", secret: "" },
        },
        {
          id: "build_message",
          type: "transform",
          label: "Build Message",
          position: { x: 340, y: 160 },
          config: {
            mode: "mapping",
            output: {
              message: "New submission from {{webhook.name}} ({{webhook.email}}) at {{webhook.company}}",
            },
          },
        },
        {
          id: "send_notification",
          type: "email",
          label: "Send Notification",
          position: { x: 620, y: 160 },
          config: {
            to: "team@example.com",
            subject: "New webhook submission",
            body: "{{transform.data.message}}\n\n— FlowForge",
          },
        },
      ],
      edges: [
        { id: "e1", source: "notify_webhook", target: "build_message" },
        { id: "e2", source: "build_message", target: "send_notification" },
      ],
    },
  },
];
