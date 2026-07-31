-- Tracks when an outreach email was sent for a lead, distinct from the
-- generic last_contact_date (which covers any kind of contact, not
-- specifically "I emailed them"). Set in bulk from the Saved Leads table via
-- markEmailsSent (leads.functions.ts).

ALTER TABLE public.leads ADD COLUMN email_sent_at timestamptz;

CREATE INDEX leads_email_sent_idx ON public.leads (email_sent_at)
  WHERE email_sent_at IS NOT NULL;

ALTER TABLE public.lead_activities DROP CONSTRAINT lead_activities_action_check;
ALTER TABLE public.lead_activities ADD CONSTRAINT lead_activities_action_check CHECK (action IN (
  'created', 'updated', 'saved', 'status_changed', 'assigned',
  'note_added', 'reviewed', 'rechecked', 'merged', 'duplicate_merged',
  'archived', 'unarchived', 'deleted', 'bulk_archived', 'bulk_deleted',
  'exported', 'imported', 'search_started', 'search_cancelled',
  'settings_changed', 'demo_data_loaded', 'demo_data_removed',
  'email_sent', 'bulk_email_sent'
));

NOTIFY pgrst, 'reload schema';
