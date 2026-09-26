-- Protocol-level audit events (specs/002-manual-protocol-authoring, research R-102).
--
-- Constitution Principle II: every mutation appends an event. A protocol created
-- from the Protocols screen belongs to no experiment, so its PROTOCOL_CREATED
-- event has no experiment_id. No RLS change: evt_by_owner already hides these
-- rows from the browser, and no screen reads them.
alter table events alter column experiment_id drop not null;
