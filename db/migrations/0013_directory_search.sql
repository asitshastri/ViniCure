-- Public directory search (P4-03): the two sort orders other than the default listing index.
-- Only active doctors are ever listed, so the indexes are partial.
CREATE INDEX doctors_active_name_idx ON doctors (lower(display_name), id) WHERE status = 'active';
CREATE INDEX doctors_active_fee_idx ON doctors (consultation_fee_paise, id) WHERE status = 'active';
CREATE INDEX doctors_active_language_idx ON doctors USING gin (languages) WHERE status = 'active';
